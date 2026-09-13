export const LANGUAGE_KEY = 'hopmodo.language';
export const normalizeLanguage = value => /^zh(?:[-_]|$)/i.test(value || '') ? 'zh' : 'en';
export const languageTag = language => normalizeLanguage(language) === 'zh' ? 'zh-CN' : 'en';
const stateKey = Symbol.for('hopmodo.language.preference');

// Same-origin game frames share only this preference, never game or camera state.
function scope() {
  try { if (globalThis.window?.top?.location.origin === globalThis.location.origin) return window.top; } catch { /* Standalone or cross-origin host. */ }
  return globalThis;
}
function state() {
  const owner = scope();
  if (!owner[stateKey]) {
    const value = owner[stateKey] = {choice: null, listeners: new Set()};
    owner.addEventListener?.('storage', event => {
      if (event.key !== LANGUAGE_KEY && event.key !== null) return;
      value.choice = ['en', 'zh'].includes(event.newValue) ? event.newValue : null;
      for (const listener of value.listeners) listener(readLanguage());
    });
  }
  return owner[stateKey];
}
export function preferredLanguage(languages = []) {
  // The user's first preferred language wins; unsupported languages use English.
  return normalizeLanguage(languages[0]);
}
export function readLanguage() {
  if (state().choice) return state().choice;
  try {
    const saved = scope().localStorage?.getItem(LANGUAGE_KEY);
    if (['en', 'zh'].includes(saved)) return saved;
  } catch { /* Browser language still works without storage. */ }
  return preferredLanguage(scope().navigator?.languages?.length ? scope().navigator.languages : [scope().navigator?.language]);
}
export function saveLanguage(value) {
  const language = normalizeLanguage(value);
  state().choice = language;
  try { scope().localStorage?.setItem(LANGUAGE_KEY, language); } catch { /* Keep the choice for this page and its game frames. */ }
  for (const listener of state().listeners) listener(language);
  return language;
}
export function subscribeLanguage(listener) {
  state().listeners.add(listener);
  return () => state().listeners.delete(listener);
}
