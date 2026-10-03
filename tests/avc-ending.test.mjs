import test from 'node:test';
import assert from 'node:assert/strict';
import {EncodedPacket} from 'mediabunny';
import {combineAvcEnding,UnsupportedAvcError} from '../apps/arcade/src/avc-ending.js';

const join=parts=>new Uint8Array(Buffer.concat(parts.map(p=>Buffer.from(p))));
const bits=(text)=>{const padded=text+'0'.repeat((8-text.length%8)%8);return new Uint8Array(padded.match(/.{8}/g).map(byte=>parseInt(byte,2)));};
// Small synthetic headers: SPS 0, PPS 0 -> SPS 0, CAVLC, and IDR -> PPS 0.
const sps=new Uint8Array([0x67,66,0,32,0xc0]);
const pps=join([[0x68],bits('1101')]);
const config=(sets=[sps],pictures=[pps])=>({codec:'avc1.420020',codedWidth:1280,codedHeight:800,description:join([
 [1,66,0,32,255,224|sets.length],...sets.flatMap(unit=>[[unit.length>>8,unit.length&255],unit]),
 [pictures.length],...pictures.flatMap(unit=>[[unit.length>>8,unit.length&255],unit]),
])});
const packet=(...units)=>new EncodedPacket(join(units.flatMap(unit=>{
 const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,unit.length);return [length,unit];
})),'key',0,3);
const descriptions=data=>{
 const sets=[],pictures=[];let offset=6;
 const group=(count,list)=>{for(let i=0;i<count;i++){const length=data[offset]*256+data[offset+1];offset+=2;list.push(data.slice(offset,offset+length));offset+=length;}};
 group(data[5]&31,sets);group(data[offset++],pictures);return {sets,pictures};
};

test('AVC ending declares separate parameter IDs without mutating gameplay configuration',()=>{
 const original=config(),snapshot=original.description.slice(),adapter=combineAvcEnding(original,config());
 const {sets,pictures}=descriptions(adapter.config.description);
 assert.deepEqual(original.description,snapshot);assert.deepEqual(sets[0],sps);assert.deepEqual(pictures[0],pps);
 // Ending SPS becomes ID 1 (010); PPS becomes ID 15 (000010000) -> SPS 1.
 assert.deepEqual(sets[1],join([[0x67,66,0,32],bits('0101')]));
 assert.deepEqual(pictures[1],join([[0x68],bits('00001000001001')]));
 assert.equal(adapter.config.codec,'avc1.420020');
 // first_mb=0, I slice=2, PPS=0, payload=10101, trailing stop bit=1.
 const source=packet(join([[0x65],bits('10111'+'10101'+'1')])),before=source.data.slice();
 const result=adapter.packet(source);
 const expected=packet(join([[0x65],bits('1011'+'000010000'+'10101'+'1')]));
 assert.deepEqual(result.data,expected.data);assert.deepEqual(source.data,before);
 assert.equal(result.data.length-source.data.length,1); // whole-byte slice shift
 assert.equal(result.timestamp,source.timestamp);assert.equal(result.duration,3);
});

test('ending parameter IDs avoid existing SPS/PPS IDs and keep byte alignment',()=>{
 const sps1=join([[0x67,66,0,32],bits('0101')]);
 const pps15=join([[0x68],bits('0000100001001')]); // PPS 15 -> SPS 0
 const adapter=combineAvcEnding(config([sps,sps1],[pps,pps15]),config());
 const {sets,pictures}=descriptions(adapter.config.description);
 assert.deepEqual(sets[2],join([[0x67,66,0,32],bits('0111')])); // SPS 2
 assert.deepEqual(pictures[2],join([[0x68],bits('00001000101101')])); // PPS 16 -> SPS 2
});

test('unsupported profiles, entropy coding and malformed NALs require compatibility export',()=>{
 const high=sps.slice();high[1]=100;
 assert.throws(()=>combineAvcEnding(config([high]),config()),UnsupportedAvcError);
 const cabac=join([[0x68],bits('1111')]);
 assert.throws(()=>combineAvcEnding(config(),config([sps],[cabac])),UnsupportedAvcError);
 const adapter=combineAvcEnding(config(),config());
 assert.throws(()=>adapter.packet(new EncodedPacket(new Uint8Array([0,0,0,50,0x65]),'key',0,3)),UnsupportedAvcError);
 assert.throws(()=>adapter.packet(packet(new Uint8Array([0x09,0x10]))),/no picture/);
 assert.throws(()=>combineAvcEnding({...config(),description:new Uint8Array([1,66])},config()),UnsupportedAvcError);
});

test('optional ending SEI is omitted while the IDR picture remains decodable',()=>{
 const adapter=combineAvcEnding(config(),config());
 const picture=join([[0x65],bits('10111'+'10101'+'1')]);
 const result=adapter.packet(packet(new Uint8Array([0x06,0x80]),picture));
 assert.deepEqual(result.data,adapter.packet(packet(picture)).data);
});
