import {languageControl, localizeDocument} from './localize-dom.js';
import './language.css';

// Each independently built game uses the same locale and presentation adapter.
function install() {
  if (!document.querySelector('select#language')) {
    const control = languageControl(); control.classList.add('standalone-language');
    document.body.append(control);
  }
  localizeDocument();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
else queueMicrotask(install);
