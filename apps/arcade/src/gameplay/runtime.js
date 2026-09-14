// Same-origin presentation boundary. Game rules and input providers stay outside.
export function createFrameRuntime(frame, connect) {
 let provider=null,unsubscribe=null,unsubscribeTracking=null,options={},disposed=false;
 const listeners=new Set(),trackingListeners=new Set();
 const notify=()=>{for(const listener of listeners)listener();};
 const tracked=value=>{for(const listener of trackingListeners)listener(value);};
 function bind(){
  if(disposed)return;
  unsubscribe?.();unsubscribeTracking?.();provider=connect(frame.contentWindow);
  provider?.configureHost?.(options);
  unsubscribe=provider?.subscribe?.(notify)||null;
  unsubscribeTracking=provider?.subscribeTracking?.(tracked)||null;notify();
 }
 frame.addEventListener('load',bind);
 if(frame.contentDocument?.readyState==='complete')bind();
 return {
  getViewport:()=>({width:frame.contentWindow?.innerWidth||frame.clientWidth,height:frame.contentWindow?.innerHeight||frame.clientHeight}),
  readFrame:()=>disposed?null:provider?.getFrame()||null,
  subscribe(callback){listeners.add(callback);return()=>listeners.delete(callback);},
  subscribeTracking(callback){trackingListeners.add(callback);return()=>trackingListeners.delete(callback);},
  configureHost(value){options=value;provider?.configureHost?.(options);},
  dispose(){if(disposed)return;disposed=true;frame.removeEventListener('load',bind);unsubscribe?.();unsubscribeTracking?.();provider?.dispose?.();listeners.clear();trackingListeners.clear();provider=null;},
 };
}

// New games implement this API; no host changes or game-specific selectors needed.
export const createNativeAdapter=frame=>createFrameRuntime(frame,window=>window.gameplay);
