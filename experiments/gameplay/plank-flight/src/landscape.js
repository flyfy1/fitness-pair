import {t} from './i18n.js';

/** Orientation is a preference, never a prerequisite for camera or demo entry. */
export function setupOrientation(stage, controls, select, status) {
  const touch=matchMedia('(any-pointer: coarse)');
  let pending=false,started=false;
  const refresh=()=>{controls.hidden=started||!touch.matches;};
  const unlock=()=>{try{screen.orientation?.unlock?.();}catch{}};
  select.addEventListener('change',async()=>{
    if(pending)return;
    const choice=select.value;
    unlock();
    status.textContent='';
    if(choice==='device')return;
    pending=true;select.disabled=true;
    try {
      if(typeof screen.orientation?.lock!=='function')throw new Error('Orientation lock unavailable');
      if(!document.fullscreenElement)await stage.requestFullscreen?.();
      if(started)return;
      await screen.orientation.lock(choice);
      if(started)unlock();
    } catch {
      unlock();select.value='device';
      status.textContent=t('Automatic rotation is unavailable. You can still start and play in either orientation.');
    } finally {pending=false;select.disabled=false;}
  });
  touch.addEventListener('change',refresh);
  window.addEventListener('pagehide',unlock);
  refresh();
  return {finishSetup(){started=true;unlock();refresh();}};
}
