import {languageControl, localizeDocument} from '../../../../packages/gameplay/localize-dom.js';
// One host-owned microphone control and HUD reservation for every game entry.
export function mountConversationControls(doc,connect){
 const view=doc.defaultView;
 doc.documentElement.classList.add('hopmodo-hosted');
 const element=doc.createElement('div');element.className='hopmodo-conversation';
 element.innerHTML='<button type="button" data-stop-game hidden>Stop game</button><button type="button" data-debug-report aria-label="Debug report" title="Debug report"><span aria-hidden="true">🐞</span></button><button type="button" data-conversation aria-label="Record conversation" title="Record conversation" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/><path class="mic-off" d="m3 3 18 18"/></svg></button><button type="button" data-replay-share hidden>View replay</button><span data-replay-status role="status" hidden></span><span role="status" hidden>Microphone off</span>';
 const style=doc.createElement('style');
 style.textContent=`
 .hopmodo-conversation{display:flex;align-items:center;gap:8px;position:fixed;right:12px;top:12px;z-index:100;color:#182346;font:12px Arial,sans-serif}
 .hopmodo-conversation button{display:grid;place-items:center;width:40px;height:40px;min-width:40px;min-height:40px;padding:0;box-shadow:0 2px 12px #0003;border:1px solid #18234633;border-radius:50%;background:#fff;color:#182346}
 .hopmodo-conversation [data-stop-game]{width:auto;padding:0 13px;border-radius:20px;font-weight:700}
 .hopmodo-conversation[data-state=recording] [data-conversation]{background:#a92020;color:#fff}
 .hopmodo-conversation[data-state=ready] [data-conversation],.hopmodo-conversation[data-state=pending] [data-conversation]{background:#2347ee;color:#fff}
 .hopmodo-conversation button[aria-pressed=true] .mic-off{display:none}
 .hopmodo-conversation>span:not([data-replay-status]){position:absolute;right:0;top:calc(100% + 6px);width:max-content;max-width:min(260px,calc(100vw - 24px));padding:8px;border:1px solid #18234655;border-radius:8px;background:#fff;line-height:1.4}
 .hopmodo-conversation [data-replay-share]{position:fixed;right:12px;bottom:12px;width:auto;height:44px;padding:6px 16px;border-radius:22px;background:#fff;color:#2347ee;border:2px solid #2347ee;font-size:16px}
 .hopmodo-conversation [data-replay-status]{position:fixed;right:12px;bottom:64px;max-width:min(300px,calc(100vw - 24px));padding:8px 12px;border-radius:8px;background:#fff;color:#182346;line-height:1.4;box-shadow:0 2px 12px #0003}
 .hopmodo-conversation [data-replay-share]:disabled{opacity:1;cursor:default;color:#182346;border-color:#18234655}
 .hopmodo-conversation [hidden]{display:none}
 .hopmodo-conversation button:focus-visible{outline:3px solid #ff795e;outline-offset:2px}
 .hopmodo-native-hud{padding-right:calc(var(--hopmodo-native-padding,0px) + 176px)!important;gap:min(12px,2vw)!important;box-sizing:border-box}
 .hopmodo-native-hud button{white-space:nowrap}
 .hopmodo-native-hud>*{min-width:0;flex-shrink:1}
 @media(max-width:420px){.hopmodo-native-hud button{padding-inline:4px}.hopmodo-native-hud small{letter-spacing:0}}
 `;
 const hud=doc.querySelector('header,.hud');
 if(hud){
  // Reserve space in the host, keeping native game CSS and controls untouched.
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
 localizeDocument(doc);
 const position=()=>{const tracking=doc.querySelector('.movement-hud');element.style.top=tracking?`${Math.ceil(tracking.getBoundingClientRect().bottom+8)}px`:'12px';};position();
 const place=()=>{(doc.fullscreenElement||doc.body).append(element);position();};place();
 view?.addEventListener('resize',position);
 doc.addEventListener('fullscreenchange',place);connect(element);
 return ()=>{view?.removeEventListener('resize',position);doc.removeEventListener('fullscreenchange',place);hud?.classList.remove('hopmodo-native-hud');element.remove();style.remove();};
}
