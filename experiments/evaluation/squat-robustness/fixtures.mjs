import {assertPoseFrame} from '../../../contracts/index.js';

// Authored geometry and event labels only: no camera, model or participant data.
export function squatRobustnessCases() {
  const cases=[];
  function scenario(id,interval=80){
    const frames=[],expectedCompletions=[];let time=0;
    function add(duration,{down=false,shift=0,collapsed=false,missing=false,jitter=false}={}){
      for(let i=0;i<Math.ceil(duration/interval);i++){
        time+=interval;
        const joints={};
        if(!missing)for(const side of ['left','right']){
          const noise=jitter ? .0015*Math.sin(frames.length*1.7+(side==='left'?0:2)) : 0;
          for(const [joint,x,y] of [['Shoulder',.5,down ? .28 : .2],['Hip',.5,down ? .53 : .45],['Knee',down ? .68 : .5,.65],['Ankle',.5,.9]])
            joints[side+joint]={x:x+noise,y:y+shift+noise,confidence:1};
          if(collapsed)joints[side+'Knee']={...joints[side+'Hip']};
        }
        const frame={version:1,sessionId:id,source:{kind:'synthetic',id},seq:frames.length,tMs:time,
          modelId:'authored-squat-geometry/2',coordinateSpace:'image-normalized-unmirrored',image:{width:640,height:480},joints};
        assertPoseFrame(frame);frames.push(frame);
      }
    }
    function returnToStanding(duration=1200,options={}){expectedCompletions.push(time+interval);add(duration,options);}
    function finish(note){cases.push({id,frames,expectedCompletions,note});}
    return {add,returnToStanding,finish};
  }
  for(const interval of [62.5,100,1000/6]){
    const s=scenario(`valid-${Math.round(1000/interval)}fps`,interval);s.add(2400);
    for(let i=0;i<3;i++){s.add(960,{down:true});s.returnToStanding();}
    s.finish('Three authored full cycles at a fixed input sampling rate.');
  }
  {
    const s=scenario('joint-jitter');s.add(2400,{jitter:true});
    for(let i=0;i<3;i++){s.add(960,{down:true,jitter:true});s.returnToStanding(1200,{jitter:true});}
    s.finish('Small bounded coordinate noise, including the standing prefix.');
  }
  {
    const s=scenario('short-occlusion');s.add(2400);s.add(960,{down:true});s.add(160,{missing:true});s.returnToStanding();
    s.finish('Brief missing joints preserve a previously confirmed down phase.');
  }
  {
    const s=scenario('long-occlusion');s.add(2400);s.add(960,{down:true});s.add(800,{missing:true});s.add(2400);s.add(960,{down:true});s.returnToStanding();
    s.finish('Long loss cancels an interrupted cycle; a fresh calibrated cycle counts.');
  }
  {
    const s=scenario('collapsed-knee-joints');s.add(2400);s.add(960,{down:true,collapsed:true});s.add(2400);
    s.finish('Coincident hip/knee coordinates are unusable tracking, not a completed action.');
  }
  for(const shift of [.04,.07]){
    const s=scenario(shift===.04?'small-standing-shift':'repositioned-standing');s.add(2400);s.add(2400,{shift});s.add(960,{down:true,shift});s.returnToStanding(1200,{shift});
    s.finish('After a stationary camera-coordinate shift, one new cycle should work without a reset button.');
  }
  {
    const s=scenario('airborne-return');s.add(2400);s.add(960,{down:true});s.add(960,{shift:-.09});s.returnToStanding();
    s.finish('Straight legs above the standing baseline do not complete a cycle until return to baseline.');
  }
  return cases;
}
