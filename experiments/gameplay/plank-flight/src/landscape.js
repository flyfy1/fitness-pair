/** Phone play uses native landscape; unsupported browsers keep a rotation prompt. */
export function setupLandscape(stage, prompt, button, onPortrait) {
  const touch = matchMedia('(any-pointer: coarse)');
  const portrait = matchMedia('(orientation: portrait)');
  const mobile = () => touch.matches && Math.min(innerWidth,innerHeight)<=600;
  const blocked = () => mobile() && portrait.matches;
  let wasBlocked=false, pending=false;
  const refresh = () => {
    const waiting=blocked();
    prompt.hidden=!waiting;
    for(const child of stage.children)if(child!==prompt)child.inert=waiting;
    if(waiting&&!wasBlocked) { onPortrait(); button.focus(); }
    wasBlocked=waiting;
  };
  const request = async () => {
    if(!mobile()||pending)return;
    pending=true;
    try {
      if(typeof screen.orientation?.lock!=='function')return;
      if(!document.fullscreenElement)await stage.requestFullscreen?.();
      await screen.orientation.lock('landscape');
    } catch {
      // Physical rotation remains available when native locking is rejected.
    } finally {pending=false;refresh();}
  };
  button.addEventListener('click',request);
  portrait.addEventListener('change',refresh);
  touch.addEventListener('change',refresh);
  window.addEventListener('resize',refresh);
  window.addEventListener('pagehide',()=>{try{screen.orientation?.unlock?.();}catch{}});
  refresh();
  return {blocked,request};
}
