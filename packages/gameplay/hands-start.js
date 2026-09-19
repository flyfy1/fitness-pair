import {sameSource} from '../../contracts/index.js';

// Consumes the host's already-computed gesture result. Never owns a detector.
export class HandsStartGate {
 constructor({countdownMs=0}={}){this.countdownMs=countdownMs;this.reset(null);}
 reset(session){this.session=session;this.open=false;this.ready=false;this.stage='waiting';this.progress=0;this.readySince=null;this.countdownAt=null;this.lastSeq=-1;this.remaining=0;}
 update(frame,ready,now=frame.tMs,hands=null){
  if(!this.session||frame.sessionId!==this.session.sessionId||!sameSource(frame.source,this.session.source))return false;
  if(frame.seq<=this.lastSeq)return this.open;
  this.lastSeq=frame.seq;
  if(this.open)return true;
  if(!ready||now-frame.tMs>250||now<frame.tMs){this.ready=false;this.readySince=null;this.stage='waiting';this.progress=0;this.countdownAt=null;return false;}
  if(!this.ready){this.ready=true;this.readySince=frame.tMs;this.stage='raise';}
  if(!hands||hands.inputSeq!==frame.seq||!hands.tracked){this.ready=false;this.readySince=null;this.stage='waiting';this.progress=0;this.countdownAt=null;return false;}
  if(this.stage==='raise'){
   this.progress=hands.kind==='one-hand'&&hands.side==='left'?Math.min(hands.progress,(frame.tMs-this.readySince)/1000):0;
   if(hands.event?.kind==='one-hand'&&hands.side==='left'&&frame.tMs-this.readySince>=1000)this.stage='lower';
  }else if(this.stage==='lower'&&hands.neutral&&!hands.latched){
   if(this.countdownMs){this.stage='countdown';this.countdownAt=frame.tMs;}
   else{this.open=true;this.stage='open';}
  }else if(this.stage==='countdown'){
   if(!hands.neutral){this.stage='lower';this.countdownAt=null;}
   else if(frame.tMs-this.countdownAt>=this.countdownMs){this.open=true;this.stage='open';}
  }
  this.remaining=this.countdownAt===null?0:Math.max(1,Math.ceil((this.countdownMs-frame.tMs+this.countdownAt)/1000));
  return this.open;
 }
}
