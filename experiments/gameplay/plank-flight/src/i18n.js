import chinese from '../resources/ui.zh.json' with {type:'json'};
import {readLanguage,saveLanguage} from '../../../../packages/gameplay/locale.js';
let language=readLanguage();
const english=Object.fromEntries(Object.entries(chinese).map(([en,zh])=>[zh,en]));
export const getLanguage=()=>language;
export const setLanguage=value=>(language=saveLanguage(value));
export function t(value){const source=english[value]||value;return language==='zh'?(chinese[source]||source):source;}
export function localizeDOM(root=document){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(node.parentElement?.closest('script,style,[data-no-i18n]'))continue;
  const trimmed=node.textContent.trim(),translated=t(trimmed);
  if(translated!==trimmed)node.textContent=node.textContent.replace(trimmed,translated);
 }
 for(const node of root.querySelectorAll('[aria-label],[title]'))for(const attribute of ['aria-label','title']){
  if(node.hasAttribute(attribute))node.setAttribute(attribute,t(node.getAttribute(attribute)));
 }
 document.documentElement.lang=language==='zh'?'zh-CN':'en';
}
