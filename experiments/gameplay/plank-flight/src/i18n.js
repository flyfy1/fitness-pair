import {translateText} from '../../../../packages/gameplay/i18n.js';
import {readLanguage,saveLanguage} from '../../../../packages/gameplay/locale.js';
import {localizeDocument} from '../../../../packages/gameplay/localize-dom.js';
export const getLanguage=readLanguage;
export const setLanguage=saveLanguage;
export const t=translateText;
export const localizeDOM=(root=document)=>localizeDocument(root.ownerDocument||root).refresh();
