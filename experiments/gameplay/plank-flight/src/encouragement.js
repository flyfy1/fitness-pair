import pack from '../resources/encouragement.json' with {type:'json'};
export const encouragementPack=pack;

// Counts completed gates, not frames, movement progress, or inferred exercise reps.
export function createEncouragementSchedule(random=Math.random){
 const bags=new Map(),last=new Map();let next=0,lastGate=0,lastTime=0;
 const gap=()=>2+Math.floor(random()*4);
 function choose(kind){
  let bag=bags.get(kind);
  if(!bag?.length){
   bag=pack.clips.filter(clip=>clip.kind===kind);
   for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
   if(bag.length>1&&bag.at(-1).id===last.get(kind)){[bag[0],bag[bag.length-1]]=[bag.at(-1),bag[0]];}
   bags.set(kind,bag);
  }
  const clip=bag.pop();last.set(kind,clip.id);return clip;
 }
 return {
  reset(){lastGate=0;lastTime=0;next=gap();},
  milestone(passed,seconds,audible=true){
   if(!Number.isSafeInteger(passed)||passed<=lastGate||!Number.isFinite(seconds))return null;
   lastGate=passed;
   if(passed<next)return null;
   if(!audible){next=passed+gap();return null;}
   if(seconds-lastTime<12)return null;
   next=passed+gap();lastTime=seconds;return choose('milestone');
  },
  finish:()=>choose('finish'),
 };
}
