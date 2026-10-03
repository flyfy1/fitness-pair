// Keep avc1's parameter sets out of band. Give only the independent ending new
// SPS/PPS IDs and declare both sets in one avcC record; gameplay NALs stay intact.
export class UnsupportedAvcError extends Error {}
const fail=message=>{throw new UnsupportedAvcError(message||'Unsupported AVC ending configuration.');};
const bytes=value=>ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);
const join=parts=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};

function rbsp(unit){
 const result=[];
 for(let i=1;i<unit.length;i++){
  if(i>=3&&unit[i]===3&&unit[i-1]===0&&unit[i-2]===0){if(i+1>=unit.length||unit[i+1]>3)fail();continue;}
  result.push(unit[i]);
 }
 return new Uint8Array(result);
}
function escaped(header,data){
 const result=[header];let zeros=0;
 for(const value of data){if(zeros>=2&&value<=3){result.push(3);zeros=0;}result.push(value);zeros=value===0?zeros+1:0;}
 return new Uint8Array(result);
}
const bit=(data,index)=>{if(index>=data.length*8)fail('Incomplete AVC header.');return (data[index>>3]>>(7-(index&7)))&1;};
function ue(data,start){
 let cursor=start,zeros=0;while(bit(data,cursor++)===0){if(++zeros>31)fail();}
 let value=0;for(let i=0;i<zeros;i++)value=value*2+bit(data,cursor++);
 return {value:2**zeros-1+value,start,end:cursor};
}
function ueBits(value){const binary=(value+1).toString(2);return [...'0'.repeat(binary.length-1)+binary].map(Number);}
function rewrite(unit,replacements){
 const data=rbsp(unit);let last=data.length*8-1;while(last>=0&&!bit(data,last))last--;
 if(last<0)fail('Missing AVC trailing bits.');
 const result=[];let cursor=0;
 for(const {start,end,value} of replacements){
  if(start<cursor||end>last)fail();
  while(cursor<start)result.push(bit(data,cursor++));
  result.push(...ueBits(value));cursor=end;
 }
 while(cursor<=last)result.push(bit(data,cursor++));
 const packed=new Uint8Array(Math.ceil(result.length/8));result.forEach((v,i)=>{packed[i>>3]|=v<<(7-(i&7));});
 return escaped(unit[0],packed);
}
function description(config){
 if(!config.description||!config.codec.startsWith('avc1'))fail();
 const data=bytes(config.description);if(data.length<7||data[0]!==1)fail();
 const lengthSize=(data[4]&3)+1;let offset=6;
 const group=count=>{const units=[];for(let i=0;i<count;i++){
  if(offset+2>data.length)fail();const length=data[offset]*256+data[offset+1];offset+=2;
  if(!length||offset+length>data.length)fail();units.push(data.subarray(offset,offset+length));offset+=length;
 }return units;};
 const sps=group(data[5]&31);if(offset>=data.length)fail();const pps=group(data[offset++]);
 if(!sps.length||!pps.length)fail();
 return {data,lengthSize,sps,pps,suffix:data.subarray(offset)};
}
const freeId=(used,max,accept=()=>true)=>{for(let id=0;id<=max;id++)if(!used.has(id)&&accept(id))return id;fail('No compatible unused AVC parameter IDs.');};
const parameterBytes=units=>join(units.flatMap(unit=>{if(unit.length>65535)fail();return [new Uint8Array([unit.length>>8,unit.length&255]),unit];}));

export function combineAvcEnding(originalConfig,endingConfig){
 const original=description(originalConfig),ending=description(endingConfig);
 // The native replay preference is Baseline AVC. CAVLC has no CABAC byte
 // alignment to rewrite after changing the ending slice's Exp-Golomb PPS ID.
 if(original.lengthSize!==4||ending.sps.length!==1||ending.pps.length!==1||
    original.sps.length>=31||original.pps.length>=255||
    [...original.sps,...ending.sps].some(unit=>(unit[0]&31)!==7||rbsp(unit)[0]!==66)){
  fail('Fast ending requires Baseline AVC.');
 }
 const spsIds=new Set(original.sps.map(unit=>{const id=ue(rbsp(unit),24).value;if(id>31)fail();return id;}));
 const ppsIds=new Set(original.pps.map(unit=>{
  if((unit[0]&31)!==8)fail();const data=rbsp(unit),field=ue(data,0),sps=ue(data,field.end);
  if(field.value>255||!spsIds.has(sps.value))fail();return field.value;
 }));
 const spsField=ue(rbsp(ending.sps[0]),24),ppsData=rbsp(ending.pps[0]);
 const ppsField=ue(ppsData,0),ppsSpsField=ue(ppsData,ppsField.end);
 // Changing the slice header by whole bytes also preserves alignment if the
 // encoder uses I_PCM macroblocks. Only the ending's parameter IDs change.
 const spsId=freeId(spsIds,31),ppsId=freeId(ppsIds,255,id=>(ueBits(id).length-(ppsField.end-ppsField.start))%8===0);
 if((ending.pps[0][0]&31)!==8||ppsSpsField.value!==spsField.value||bit(ppsData,ppsSpsField.end)!==0)fail('Unsupported ending entropy coding.');
 const sps=[...original.sps,rewrite(ending.sps[0],[{...spsField,value:spsId}])];
 const pps=[...original.pps,rewrite(ending.pps[0],[{...ppsField,value:ppsId},{...ppsSpsField,value:spsId}])];
 const header=original.data.slice(0,6);header[5]=(header[5]&224)|sps.length;
 const config={...originalConfig,description:join([header,parameterBytes(sps),new Uint8Array([pps.length]),parameterBytes(pps),original.suffix])};
 return {
  config,
  packet(packet){
   const units=[];let offset=0,hasPicture=false;
   while(offset<packet.data.length){
    if(offset+ending.lengthSize>packet.data.length)fail();let length=0;
    for(let i=0;i<ending.lengthSize;i++)length=length*256+packet.data[offset++];
    if(!length||offset+length>packet.data.length)fail();
    let unit=packet.data.subarray(offset,offset+length);offset+=length;const type=unit[0]&31;
    if(type===5){
     hasPicture=true;
     const data=rbsp(unit),first=ue(data,0),slice=ue(data,first.end),field=ue(data,slice.end);
     if(field.value!==ppsField.value)fail('Unknown ending picture parameter ID.');
     unit=rewrite(unit,[{...field,value:ppsId}]);
    }else if(type===6||type===7||type===8){
     // Optional encoder SEI can refer to its old SPS ID. The still invitation
     // needs none of it; parameter sets are already declared in avcC.
     continue;
    }else if(type!==9&&type!==12)fail('The ending must contain only IDR pictures.');
    const prefix=new Uint8Array(4);new DataView(prefix.buffer).setUint32(0,unit.length);units.push(prefix,unit);
   }
   if(!hasPicture)fail('The ending contains no picture.');
   return packet.clone({data:join(units)});
  },
 };
}
