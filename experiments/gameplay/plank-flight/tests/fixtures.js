export function pose(tMs=0, variant='high', extra={}) {
  const joints={};
  const points={high:[[.22,.40],[.23,.54],[.23,.68],[.46,.42],[.65,.44],[.84,.46]],
    forearm:[[.22,.40],[.22,.60],[.13,.63],[.46,.42],[.65,.44],[.84,.46]],
    low:[[.22,.52],[.15,.56],[.23,.68],[.46,.54],[.65,.56],[.84,.58]],
    rest:[[.22,.40],[.23,.54],[.23,.68],[.46,.73],[.65,.60],[.84,.46]],
    prone:[[.22,.65],[.23,.66],[.23,.67],[.46,.65],[.65,.65],[.84,.65]],
    standing:[[.5,.2],[.5,.35],[.5,.48],[.5,.48],[.5,.68],[.5,.88]]};
  if(variant!=='missing')for(const side of ['left','right'])['Shoulder','Elbow','Wrist','Hip','Knee','Ankle'].forEach((name,i)=>{
    const [x,y]=points[variant][i];joints[side+name]={x,y,confidence:.99};
  });
  return {version:1,sessionId:'test',source:{kind:'synthetic',id:'fixture'},seq:tMs+1,tMs,modelId:'fixture',coordinateSpace:'image-normalized-unmirrored',image:{width:640,height:480},joints,...extra};
}
