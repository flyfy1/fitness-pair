import {assertPoseFrame} from '../../contracts/index.js';

// A small presentation-boundary publisher. Games still own pose production;
// recorders may observe validated frames without polling or owning the camera.
export function createTrackingPublisher(){
 const listeners=new Set();
 return Object.freeze({
  emit(frame){
   assertPoseFrame(frame);
   for(const listener of listeners)listener(frame);
  },
  subscribe(listener){
   if(typeof listener!=='function')throw new TypeError('Tracking listener must be a function');
   listeners.add(listener);return()=>listeners.delete(listener);
  },
  clear(){listeners.clear();},
 });
}
