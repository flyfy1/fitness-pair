import {message,translateText} from '../../../packages/gameplay/i18n.js';
import {readLanguage,normalizeLanguage,languageTag,subscribeLanguage} from '../../../packages/gameplay/locale.js';
import {SITE_URL} from './brand.js';
import {socialLinks} from './social-sharing.js';

export function gameShareMessage(game,{language=readLanguage(),origin=SITE_URL}={}){
 language=normalizeLanguage(language);
 const title=translateText(game.title,language),url=new URL('/play/'+encodeURIComponent(game.id),origin);
 url.searchParams.set('lang',language);
 return {title,url:url.href,language,text:message('gameShare.invite',[title],language)+'\n'+url.href};
}
export function gameSocialLinks(invitation){
 return [...socialLinks(invitation),['Instagram','https://www.instagram.com/'],['WhatsApp','https://wa.me/?'+new URLSearchParams({text:invitation.text})]];
}

// One shared invitation UI; it also lives inside the active fullscreen document.
export function mountGameShareButton(button,game){
 const doc=button.ownerDocument,dialog=doc.createElement('dialog'),style=doc.createElement('style');
 const triggers=[button],entry=doc.querySelector('.game-entry');let entryButton=null,invoker=button;
 if(entry){entryButton=doc.createElement('button');entryButton.type='button';entryButton.className='game-share-trigger';entryButton.dataset.textShare='';entry.querySelector('.game-entry-actions').after(entryButton);triggers.push(entryButton);}
 dialog.className='game-share-dialog';dialog.setAttribute('aria-labelledby','game-share-title');
 dialog.innerHTML='<header><h2 id="game-share-title"></h2><button type="button" data-close></button></header><p data-note></p><label><span data-label></span><textarea rows="4" readonly></textarea></label><div class="game-share-actions"><button type="button" data-copy></button><button type="button" data-link></button><button type="button" data-native hidden></button></div><div class="game-share-platforms"></div><p role="status"></p>';
 style.textContent=`.game-share-dialog{box-sizing:border-box;width:min(540px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid #d6ddd0;border-radius:24px;color:#203d39;background:#fff8e9;font:16px/1.5 ui-rounded,system-ui,sans-serif;box-shadow:0 20px 80px #173c3655}.game-share-dialog::backdrop{background:#173c3677;backdrop-filter:blur(4px)}.game-share-dialog header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:0}.game-share-dialog h2{font:800 26px/1.15 ui-rounded,system-ui,sans-serif;margin:0;letter-spacing:-.5px}.game-share-dialog [data-close]{min-width:44px;min-height:44px;border-radius:50%;font-size:22px}.game-share-dialog p{font-size:14px;margin:16px 0}.game-share-dialog label{display:block;font-weight:700}.game-share-dialog textarea{display:block;box-sizing:border-box;resize:vertical;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #b8c7b7;border-radius:12px;background:#fffdf5;color:#203d39;font:14px/1.5 system-ui,sans-serif}.game-share-actions,.game-share-platforms{display:flex;flex-wrap:wrap;gap:8px}.game-share-platforms{margin-top:16px}.game-share-dialog :is(button,a){box-sizing:border-box;min-height:44px;padding:10px 14px;border:1px solid #b8c7b7;border-radius:16px;background:#fffdf5;color:#203d39;font:700 14px/1.4 system-ui,sans-serif;text-decoration:none;text-align:center;cursor:pointer}.game-share-dialog [data-copy]{background:#277e78;color:#fffdf5}.game-share-dialog [hidden]{display:none!important}.game-share-dialog :focus-visible{outline:3px solid #e88e72;outline-offset:3px}.game-share-dialog [role=status]{min-height:21px}.game-share-trigger{min-width:44px;min-height:44px;border-radius:16px;border:1px solid #d6ddd0;background:#fff8e9;color:#203d39;cursor:pointer}@media(max-width:420px){.game-share-dialog{padding:18px}.game-share-dialog h2{font-size:23px}}`;
 doc.head.append(style);doc.body.append(dialog);
 const field=dialog.querySelector('textarea'),status=dialog.querySelector('[role=status]'),platforms=dialog.querySelector('.game-share-platforms');
 const nav=doc.defaultView.navigator;let invitation,disposed=false;
 const m=(id,values=[])=>message('gameShare.'+id,values);
 for(const [name] of gameSocialLinks(gameShareMessage(game))){
  const link=doc.createElement('a');link.dataset.platform=name;link.textContent=name;link.target='_blank';link.rel='noopener noreferrer';
  link.onclick=()=>{
   refresh();
   if(name==='Instagram'||name==='Facebook'||name==='LinkedIn')void copy(invitation.text,name);
   else status.textContent=m('review',[name]);
  };platforms.append(link);
 }
 function refresh(){
  invitation=gameShareMessage(game);dialog.lang=languageTag(invitation.language);field.lang=dialog.lang;
  for(const trigger of triggers){trigger.title=m('open');trigger.setAttribute('aria-label',m('open'));if(trigger.dataset.textShare!==undefined)trigger.textContent=m('open');}
  dialog.querySelector('h2').textContent=m('title',[invitation.title]);dialog.querySelector('[data-note]').textContent=m('note');
  dialog.querySelector('[data-label]').textContent=m('label');field.value=invitation.text;
  dialog.querySelector('[data-close]').textContent='×';dialog.querySelector('[data-close]').setAttribute('aria-label',m('close'));
  dialog.querySelector('[data-copy]').textContent=m('copy');dialog.querySelector('[data-link]').textContent=m('link');
  dialog.querySelector('[data-native]').textContent=m('native');dialog.querySelector('[data-native]').hidden=typeof nav.share!=='function';
  for(const [name,href] of gameSocialLinks(invitation)){
   const link=[...platforms.children].find(el=>el.dataset.platform===name);link.href=href;link.setAttribute('aria-label',m('platform',[name]));
   link.title=name==='Instagram'?m('instagram'):name==='X (Twitter)'?m('prefill'):m('review',[name]);
  }
 }
 async function copy(text,platform=null){
  try{await nav.clipboard.writeText(text);status.textContent=platform?m('paste',[platform]):m(text===invitation.url?'linkCopied':'copied');}
  catch{field.focus();field.select();status.textContent=m('manual');}
 }
 const close=()=>{dialog.close();invoker.focus({preventScroll:true});};
 for(const trigger of triggers)trigger.onclick=()=>{invoker=trigger;refresh();status.textContent='';(doc.fullscreenElement||doc.body).append(dialog);dialog.showModal();};
 dialog.querySelector('[data-close]').onclick=close;
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.querySelector('[data-copy]').onclick=()=>{refresh();void copy(invitation.text);};
 dialog.querySelector('[data-link]').onclick=()=>{refresh();void copy(invitation.url);};
 dialog.querySelector('[data-native]').onclick=async()=>{
  refresh();try{await nav.share({title:invitation.title,text:invitation.text,url:invitation.url});status.textContent=m('shared');}
  catch(error){status.textContent=m(error.name==='AbortError'?'cancelled':'unavailable');}
 };
 const unsubscribe=subscribeLanguage(()=>{refresh();status.textContent='';});refresh();
 const dispose=()=>{if(disposed)return;disposed=true;unsubscribe();for(const trigger of triggers)trigger.onclick=null;entryButton?.remove();dialog.remove();style.remove();doc.defaultView.removeEventListener('pagehide',dispose);};
 doc.defaultView.addEventListener('pagehide',dispose,{once:true});return dispose;
}
