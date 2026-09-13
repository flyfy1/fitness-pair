export const LANGUAGE_KEY='hopmodo.language';
export const normalizeLanguage=value=>/^zh(?:-|$)/i.test(value||'')?'zh':'en';

export function readLanguage(){
 try{const saved=globalThis.localStorage?.getItem(LANGUAGE_KEY);if(['en','zh'].includes(saved))return saved;}catch{/* Storage may be unavailable. */}
 return normalizeLanguage(globalThis.navigator?.language);
}
export function saveLanguage(value){
 const language=normalizeLanguage(value);
 try{globalThis.localStorage?.setItem(LANGUAGE_KEY,language);}catch{/* The current page can still change language. */}
 return language;
}
