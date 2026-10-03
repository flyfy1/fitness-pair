const normalize=text=>String(text||'').toLocaleLowerCase().replace(/[\s，。,.!！?？_-]+/g,'');
export function isDebugCommand(text){
 const value=normalize(text);
 return ['debugplease','pleasedebug','uploaddebug','我要上传debug','我要上传调试','开始调试'].some(command=>value===command);
}
