import baseCatalog from './translations/zh-CN.json' with {type: 'json'};
import sharingCatalog from './translations/sharing.zh-CN.json' with {type: 'json'};
const catalog = [...baseCatalog, ...sharingCatalog];
import flight from '../../experiments/gameplay/plank-flight/resources/ui.zh.json' with {type: 'json'};
import {readLanguage} from './locale.js';

const normalize = value => String(value).replace(/\s+/g, ' ').trim();
const entries = new Map(Object.entries(flight).map(([en, zh]) => [normalize(en), {en, zh}]));
for (const entry of catalog) entries.set(normalize(entry.en), entry);
const ids = new Map(catalog.map(entry => [entry.id, entry]));
const reverse = new Map([...entries.values()].map(entry => [normalize(entry.zh), entry.en]));
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = [...entries.values()].filter(entry => /\{\d+\}/.test(entry.en)).map(entry => {
  const slots = [...entry.en.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
  const parts = normalize(entry.en).split(/\{\d+\}/);
  return {entry, slots, pattern: new RegExp('^' + parts.map(escapePattern).join('(.*?)') + '$'), weight: parts.join('').length};
}).filter(template => template.weight >= 3).sort((a, b) => b.weight - a.weight);
const interpolate = (text, values) => text.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match);

// New UI uses semantic IDs. Existing hosts can migrate their English copy in place.
export function message(id, values = [], language = readLanguage()) {
  const entry = ids.get(id);
  return entry ? interpolate(language === 'zh' ? entry.zh : entry.en, values) : id;
}
export function translateText(value, language = readLanguage()) {
  if (value == null) return '';
  const raw = String(value), source = normalize(raw);
  if (!source) return raw;
  const original = reverse.get(source) || source;
  if (language !== 'zh') return reverse.has(source) ? raw.replace(raw.trim(), original) : raw;
  const entry = entries.get(original);
  if (entry) return raw.replace(raw.trim(), entry.zh);
  for (const {entry, slots, pattern} of templates) {
    const match = source.match(pattern);
    if (match) {
      const values = [];
      slots.forEach((slot, i) => { values[slot] = translateText(match[i + 1], language); });
      return raw.replace(raw.trim(), interpolate(entry.zh, values));
    }
  }
  const arrows = source.match(/^([←→↗↻↖↙↘]\s*)?(.+?)(\s*[←→↗↻↖↙↘])?$/);
  if (arrows && (arrows[1] || arrows[3])) return raw.replace(raw.trim(), (arrows[1] || '') + translateText(arrows[2], language) + (arrows[3] || ''));
  if (source.includes(' · ')) return raw.replace(raw.trim(), source.split(' · ').map(part => translateText(part, language)).join(' · '));
  return raw;
}
