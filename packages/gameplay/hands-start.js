import {BodyGestures} from '../../apps/dino-run/src/gestures.js';

// Session-scoped permission to begin gameplay, independent of game commands.
export class HandsStartGate {
 constructor(){this.gestures=new BodyGestures();this.open=false;this.ready=false;this.stage='waiting';this.progress=0;}
 reset(session){this.session=session;this.gestures.reset(session);this.open=false;this.ready=false;this.stage='waiting';this.progress=0;}
 update(frame,ready,now=frame.tMs){
  if(this.open)return true;
  if(!this.session)return false;
  if(!ready||now-frame.tMs>250){this.ready=false;this.stage='waiting';this.progress=0;this.gestures.reset(this.session);return false;}
  if(!this.ready){this.gestures.reset(this.session);this.ready=true;this.stage='raise';}
  const hands=this.gestures.update(frame);if(!hands)return false;
  if(!hands.tracked){this.stage='raise';this.progress=0;this.gestures.reset(this.session);return false;}
  if(this.stage==='raise'){
   this.progress=hands.kind==='both-hands'?hands.progress:0;
   if(hands.event?.kind==='both-hands')this.stage='lower';
   else if(hands.event?.kind==='one-hand')this.gestures.reset(this.session);
  }else if(this.stage==='lower'&&hands.neutral&&!hands.latched){this.open=true;this.stage='open';}
  return this.open;
 }
}
