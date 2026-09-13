import {assertActionFrame,sameSource} from '../../../contracts/index.js';

// One bounded training sequence. Practice observations never enter game rules.
export class InvadersTutorial {
 reset(session){this.session=session;this.step='left';this.since=null;this.lastSeq=-1;this.lastTime=-1;this.progress=0;this.shotId=null;this.seen=new Set();}
 update(action){
  assertActionFrame(action);
  if(!this.session||action.sessionId!==this.session.sessionId||!sameSource(action.source,this.session.source)
   ||action.action!=='body-arcade'||action.inputSeq<=this.lastSeq||action.tMs<=this.lastTime)return false;
  const gap=action.tMs-this.lastTime;this.lastSeq=action.inputSeq;this.lastTime=action.tMs;
  const c=action.controls;
  if(!['active','ready','completed'].includes(action.phase)||!c||!Number.isFinite(c.horizontal)||Math.abs(c.horizontal)>1){this.hold(false,action.tMs);return false;}
  if(gap>250){this.since=null;this.progress=0;}
  const freshCompletion=!!action.completion&&!this.seen.has(action.completion.id);
  if(action.completion)this.seen.add(action.completion.id);
  const before=this.step;
  if(this.step==='left'&&this.hold(c.horizontal<=-.35,action.tMs))this.next('right');
  else if(this.step==='right'&&this.hold(c.horizontal>=.35,action.tMs))this.next('fire');
  else if(this.step==='fire'&&action.phase==='completed'&&freshCompletion&&!c.rightRaised){this.shotId=action.completion.id;this.next('lower');}
  else if(this.step==='lower'&&this.hold(c.leftLowered===true&&!c.rightRaised,action.tMs))this.next('ready');
  return before!==this.step;
 }
 hold(matches,time){if(!matches){this.since=null;this.progress=0;return false;}this.since??=time;this.progress=Math.min(1,(time-this.since)/300);return this.progress>=1;}
 next(step){this.step=step;this.since=null;this.progress=0;}
 get completed(){return this.step==='ready';}
 snapshot(){return {step:this.step,progress:this.progress,completed:this.completed,shotId:this.shotId};}
}
