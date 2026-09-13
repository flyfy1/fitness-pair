import {translateText, message} from './i18n.js';
import {readLanguage, languageTag, saveLanguage, subscribeLanguage} from './locale.js';
const attributes = ['aria-label', 'aria-valuetext', 'title', 'alt', 'placeholder'];
const excluded = 'script,style,code,pre,textarea,[contenteditable],[translate="no"],[data-no-i18n]';
const installed = Symbol.for('hopmodo.document.localization');

export function languageControl(doc = document, id = 'language') {
  const label = doc.createElement('label');
  label.className = 'language-control'; label.dataset.noI18n = '';
  label.innerHTML = `<span aria-hidden="true">◎</span><select id="${id}" data-language-select aria-label="Language / 语言"><option value="en">English</option><option value="zh">简体中文</option></select>`;
  const select = label.querySelector('select'); select.value = readLanguage();
  select.onchange = () => saveLanguage(select.value);
  return label;
}

export function localizeDocument(doc = document) {
  if (doc[installed]) return doc[installed];
  const records = new WeakMap();
  function update(node, name, value, write) {
    let record = records.get(node);
    if (!record) { record = new Map(); records.set(node, record); }
    const previous = record.get(name);
    const source = previous?.rendered === value ? previous.source : value;
    const rendered = translateText(source);
    record.set(name, {source, rendered});
    if (rendered !== value) write(rendered);
  }
  function visit(root) {
    if (root.nodeType === 3) {
      if (!root.parentElement?.closest(excluded)) update(root, 'text', root.data, text => { root.data = text; });
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (root.closest(excluded)) return;
      if (root.matches('time[datetime]')) {
        const date = new Date(root.getAttribute('datetime'));
        if (Number.isFinite(date.getTime())) root.textContent = date.toLocaleDateString(languageTag(readLanguage()));
        return;
      }
      if (root.dataset.i18n) {
        const text = message(root.dataset.i18n);
        if (root.textContent !== text) root.textContent = text;
      }
      for (const name of attributes) if (root.hasAttribute(name) && !root.dataset.noI18nAttributes?.split(' ').includes(name)) update(root, name, root.getAttribute(name), text => root.setAttribute(name, text));
      if (root.matches('meta[name="description"]')) update(root, 'content', root.content, text => { root.content = text; });
      // Recompute login hints on every language change, including existing links.
      if (root.matches('a[href^="/api/auth/start?"]')) {
        const url = new URL(root.getAttribute('href'), doc.location.href);
        url.searchParams.set('lang', languageTag(readLanguage()));
        const href = url.pathname + url.search;
        if (root.getAttribute('href') !== href) root.setAttribute('href', href);
      }
    }
    for (const child of [...root.childNodes]) visit(child);
  }
  const options = {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes, 'content']};
  const observer = new doc.defaultView.MutationObserver(changes => {
    observer.disconnect();
    const roots = new Set();
    for (const change of changes) {
      if (change.type === 'childList') for (const node of change.addedNodes) roots.add(node);
      else roots.add(change.target);
    }
    for (const root of roots) if (root.isConnected) visit(root);
    observer.observe(doc.documentElement, options);
  });
  function refresh() {
    observer.disconnect();
    doc.documentElement.lang = languageTag(readLanguage());
    visit(doc);
    for (const select of doc.querySelectorAll('[data-language-select], select#language')) select.value = readLanguage();
    observer.observe(doc.documentElement, options);
  }
  let unsubscribe = subscribeLanguage(refresh);
  const pause = () => { observer.disconnect(); unsubscribe(); };
  const resume = event => { if (event.persisted) { unsubscribe = subscribeLanguage(refresh); refresh(); } };
  const dispose = () => { pause(); delete doc[installed]; doc.defaultView.removeEventListener('pagehide', pause); doc.defaultView.removeEventListener('pageshow', resume); };
  doc.defaultView.addEventListener('pagehide', pause);
  doc.defaultView.addEventListener('pageshow', resume);
  const api = {refresh, dispose}; doc[installed] = api; refresh(); return api;
}
