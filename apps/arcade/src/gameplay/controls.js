import {languageControl, localizeDocument} from '../../../../packages/gameplay/localize-dom.js';
// One host-owned microphone control and HUD reservation for every game entry.
export function mountConversationControls(doc,connect){
 const view=doc.defaultView;
 doc.documentElement.classList.add('hopmodo-hosted');
 const element=doc.createElement('div');element.className='hopmodo-conversation';
 element.innerHTML='<button type="button" data-stop-game hidden>Stop game</button><button type="button" data-debug-report aria-label="Debug report" title="Debug report"><span aria-hidden="true">🐞</span></button><button type="button" data-conversation aria-label="Record conversation" title="Record conversation" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/><path class="mic-off" d="m3 3 18 18"/></svg></button><button type="button" data-replay-share hidden>View replay</button><span data-replay-status role="status" hidden></span><span role="status" hidden>Microphone off</span>';
 const style=doc.createElement('style');
 style.textContent=`
 .hopmodo-conversation{display:flex;flex-wrap:wrap;max-width:calc(100vw - 24px);align-items:center;gap:8px;position:fixed;right:12px;top:12px;z-index:100;color:#182346;font:12px Arial,sans-serif}
 .hopmodo-conversation button{display:grid;place-items:center;width:40px;height:40px;min-width:40px;min-height:40px;padding:0;box-shadow:0 2px 12px #0003;border:1px solid #18234633;border-radius:50%;background:#fff;color:#182346}
 .hopmodo-conversation [data-stop-game]{width:auto;padding:0 13px;border-radius:20px;font-weight:700}
 .hopmodo-conversation[data-state=recording] [data-conversation]{background:#a92020;color:#fff}
 .hopmodo-conversation[data-state=ready] [data-conversation],.hopmodo-conversation[data-state=pending] [data-conversation]{background:#2347ee;color:#fff}
 .hopmodo-conversation button[aria-pressed=true] .mic-off{display:none}
 .hopmodo-conversation [data-debug-report][data-voice=on]{background:#d0eadb;border:2px solid #277e78;box-shadow:0 0 0 3px #277e7833}
 .hopmodo-conversation>span:not([data-replay-status]){position:absolute;right:0;top:calc(100% + 6px);width:max-content;max-width:min(260px,calc(100vw - 24px));padding:8px;border:1px solid #18234655;border-radius:8px;background:#fff;line-height:1.4}
 .hopmodo-conversation [data-replay-share]{position:fixed;right:12px;bottom:12px;width:auto;height:44px;padding:6px 16px;border-radius:22px;background:#fff;color:#2347ee;border:2px solid #2347ee;font-size:16px}
 .hopmodo-conversation [data-replay-status]{position:fixed;right:12px;bottom:64px;max-width:min(300px,calc(100vw - 24px));padding:8px 12px;border-radius:8px;background:#fff;color:#182346;line-height:1.4;box-shadow:0 2px 12px #0003}
 .hopmodo-conversation [data-replay-share]:disabled{opacity:1;cursor:default;color:#182346;border-color:#18234655}
 .hopmodo-conversation [hidden]{display:none}
 .hopmodo-conversation button:focus-visible{outline:3px solid #ff795e;outline-offset:2px}
 .hopmodo-hosted.game-entry-pending .hopmodo-conversation{display:flex!important;top:auto!important;bottom:12px}
 .hopmodo-hosted.game-entry-pending .hopmodo-conversation>*:not([data-debug-report]){display:none!important}
 .hopmodo-native-hud{padding-right:calc(var(--hopmodo-native-padding,0px) + var(--hopmodo-controls-reserve,0px))!important;padding-top:calc(var(--hopmodo-native-top,0px) + var(--hopmodo-controls-offset,0px))!important;gap:min(12px,2vw)!important;box-sizing:border-box}
 .hopmodo-native-hud button{white-space:nowrap}
 .hopmodo-native-hud>*{min-width:0;flex-shrink:1}
 .hopmodo-hosted [data-game-note]{display:block;right:16px;max-width:1000px;line-height:1.35}
 @media(max-width:420px){.hopmodo-native-hud button{padding-inline:4px}.hopmodo-native-hud small{letter-spacing:0}}
 `;
 const hud=doc.querySelector('header,.hud');
 if(hud){
  // Reserve space only when shared controls occupy the same row as the HUD.
  hud.style.setProperty('--hopmodo-native-padding',doc.defaultView.getComputedStyle(hud).paddingRight);
  hud.classList.add('hopmodo-native-hud');
 }
 doc.head.append(style);
 const language = doc.querySelector('select#language')?.closest('.language-control') || languageControl(doc);
 language.classList.remove('standalone-language');
 language.querySelector('span[aria-hidden]')?.remove();
 language.querySelector('option[value=en]').textContent='EN';
 language.querySelector('option[value=zh]').textContent='中文';
 element.prepend(language);
 const share=doc.createElement('button');share.type='button';share.dataset.shareGame='';share.setAttribute('aria-label','Share game');share.title='Share game';
 share.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4M9 14l6 4"/></svg>';element.append(share);
 localizeDocument(doc);
 const note=doc.querySelector('[data-game-note]'),footer=doc.querySelector('[data-game-footer]');
 const layout=doc.documentElement.style;
 const previousLayout=new Map(['--hopmodo-footer-bottom','--hopmodo-guidance-bottom','--hopmodo-hud-bottom','--hopmodo-controls-bottom'].map(name=>[name,layout.getPropertyValue(name)]));
 const previouslyStacked=doc.documentElement.classList.contains('hopmodo-hud-stacked');
 const position=()=>{
  const tracking=doc.querySelector('.movement-hud');
  element.style.top=tracking?`${Math.ceil(tracking.getBoundingClientRect().bottom+8)}px`:'12px';
  layout.setProperty('--hopmodo-controls-bottom',`${Math.ceil(element.getBoundingClientRect().bottom)}px`);
  const stacked=!!hud&&!tracking&&view.innerWidth<=700;
  doc.documentElement.classList.toggle('hopmodo-hud-stacked',stacked);
  if(hud){
   // Read the host's responsive padding without our reservation applied.
   hud.classList.remove('hopmodo-native-hud');
   const native=view.getComputedStyle(hud),top=parseFloat(native.paddingTop)||0;
   const bounds=hud.getBoundingClientRect(),controls=element.getBoundingClientRect();
   hud.style.setProperty('--hopmodo-native-padding',native.paddingRight);
   hud.style.setProperty('--hopmodo-native-top',native.paddingTop);
   hud.style.setProperty('--hopmodo-controls-reserve',tracking||stacked?'0px':`${Math.ceil(controls.width+16)}px`);
   hud.style.setProperty('--hopmodo-controls-offset',stacked?`${Math.ceil(Math.max(0,controls.bottom+12-bounds.top-top))}px`:'0px');
   hud.classList.add('hopmodo-native-hud');
   layout.setProperty('--hopmodo-hud-bottom',`${Math.ceil(hud.getBoundingClientRect().bottom)}px`);
  }
  if(note&&footer){
   const bounds=note.getBoundingClientRect();
   const reserve=bounds.height?Math.max(0,view.innerHeight-bounds.top+12):0;
   layout.setProperty('--hopmodo-footer-bottom',`${Math.ceil(reserve)}px`);
   layout.setProperty('--hopmodo-guidance-bottom',`${Math.ceil(view.innerHeight-footer.getBoundingClientRect().top+12)}px`);
  }
 };position();
 const observer=view.ResizeObserver?new view.ResizeObserver(position):null;
 for(const target of [element,hud,doc.querySelector('.movement-hud'),note,footer])if(target)observer?.observe(target);
 const place=()=>{(doc.fullscreenElement||doc.body).append(element);position();};place();
 view?.addEventListener('resize',position);
 doc.addEventListener('fullscreenchange',place);connect(element);
 return ()=>{observer?.disconnect();view?.removeEventListener('resize',position);doc.removeEventListener('fullscreenchange',place);hud?.classList.remove('hopmodo-native-hud');
  for(const [name,value] of previousLayout)if(value)layout.setProperty(name,value);else layout.removeProperty(name);
  doc.documentElement.classList.toggle('hopmodo-hud-stacked',previouslyStacked);
  element.remove();style.remove();};
}
