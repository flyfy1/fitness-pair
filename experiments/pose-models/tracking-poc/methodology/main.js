import './style.css';
import { methods, directoryMap, repo, baseline } from './catalog.js';
const $ = id => document.getElementById(id);
let status = 'implemented';
const selected = new Set(['hands','full','upper']);
const escapes = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const esc = value => String(value).replace(/[&<>"']/g, char => escapes[char]);
const link = (path, label) => `<a href="${esc((path.endsWith('/') ? repo.replace('/blob/', '/tree/') : repo) + path)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const guidance = {
  all: 'Start with the output you need. Landmark providers locate joints; action rules interpret their movement. No method here has a measured human-accuracy score.',
  desk: 'For detailed fingers, inspect Hand landmarks and its pinch cue. For arm movement, inspect Upper-body landmarks and Wrist above shoulder. These are current implementation fits, not accuracy rankings.',
  body: 'Pose Lite is the implemented body baseline. Upper body is a filtered view of the same model. Research alternatives need identical-input evaluation before a quality claim.',
  squat: 'The current path combines Full-body landmarks with the Squat state machine. Alternative classifiers need temporal completion logic as well as pose labels.',
  jump: 'Dino offers full-body jump height (hips + ankles) and upper-body height control (shoulders + hips). The latter cannot confirm takeoff. It differs from the lab’s six-joint arm view, which omits hips.',
  multi: 'Simultaneous people are not supported by the integrated single-person body contract. Two detected hands do not establish two-player support. See Research for RTMO.',
};
function evidenceLinks(m) { return link(m.evidencePath ?? m.path, 'Recorded evidence / implementation') + (m.reference ? ` · <a href="${esc(m.reference)}" target="_blank" rel="noopener noreferrer">Original source ↗</a>` : ''); }
function demo(m) {
  if (m.demo) return '<a class="demo-link" href="../">Open Tracking Lab ↗</a><span class="demo-hint">Choose the matching mode; camera starts only on request.</span>';
  if (m.command) return `<strong>${esc(m.host)}</strong><span class="demo-hint">Start from the repository root:</span><code>${esc(m.command)}</code><span class="demo-hint">Separate local server; availability is not checked here.</span>`;
  return '<span class="demo-hint">Research only · no local demo implemented.</span>';
}
function renderCards() {
  const scenario = $('scenario').value, layer = $('layer').value, query = $('search').value.trim().toLowerCase();
  const visible = methods.filter(m => (status === 'all' || m.status === status) && (scenario === 'all' || m.tags.includes(scenario)) && (layer === 'all' || m.layer === layer) && (!query || [m.name,m.summary,m.how,m.path].join(' ').toLowerCase().includes(query)));
  $('guidance').textContent = guidance[scenario];
  $('result-count').textContent = `${visible.length} of ${methods.length} methods shown`;
  $('empty').hidden = visible.length > 0;
  $('cards').innerHTML = visible.map(m => `<article class="method-card ${m.status}" data-method="${m.id}">
    <div class="card-meta"><span class="tag ${m.status}">${m.status === 'implemented' ? 'Implemented' : 'Research only'}</span><span>${esc(m.layer)}</span></div>
    <h3>${esc(m.name)}</h3><p class="summary">${esc(m.summary)}</p>
    <div class="tradeoff"><span class="positive">USEFUL FOR</span><p>${esc(m.strength)}</p><span class="caution">WATCH OUT FOR</span><p>${esc(m.limit)}</p></div>
    <div class="card-evidence"><span>EVIDENCE</span><p>${esc(m.evidence)}</p></div>
    <details><summary>How it works & source</summary><dl><dt>Method</dt><dd>${esc(m.how)}</dd><dt>Output</dt><dd>${esc(m.output)}</dd><dt>Setup</dt><dd>${esc(m.setup)}</dd><dt>Next useful test</dt><dd>${esc(m.next)}</dd><dt>Directory / source</dt><dd>${link(m.path,m.path)}</dd></dl><p class="source-links">${evidenceLinks(m)}</p><div class="demo">${demo(m)}</div></details>
    <button class="compare-button" data-compare="${m.id}" aria-pressed="${selected.has(m.id)}" aria-label="Compare ${esc(m.name)}">${selected.has(m.id) ? '✓ In comparison' : '+ Add to comparison'}</button>
  </article>`).join('');
  $('cards').querySelectorAll('[data-compare]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.compare)));
}
function toggle(id) {
  if (selected.has(id)) { selected.delete(id); $('selection-message').textContent = ''; }
  else if (selected.size >= 3) { $('selection-message').textContent = 'Three methods selected. Remove one in Your comparison before adding another.'; $('selection-message').scrollIntoView({ block:'center', behavior:'smooth' }); return; }
  else { selected.add(id); $('selection-message').textContent = ''; }
  // Update pressed state without replacing the focused button or collapsing details.
  document.querySelectorAll('[data-compare]').forEach(button => {
    const checked = selected.has(button.dataset.compare); button.setAttribute('aria-pressed', String(checked)); button.textContent = checked ? '✓ In comparison' : '+ Add to comparison';
  });
  renderComparison();
}
function renderComparison() {
  const chosen = [...selected].map(id => methods.find(m => m.id === id));
  $('selected').innerHTML = chosen.map(m => `<button data-remove="${m.id}" aria-label="Remove ${esc(m.name)} from comparison">${esc(m.name)} <span aria-hidden="true">×</span></button>`).join('');
  $('selected').querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { toggle(button.dataset.remove); $('clear').focus(); }));
  $('layer-note').hidden = new Set(chosen.map(m => m.layer)).size < 2;
  if (!chosen.length) { $('comparison-table').innerHTML = '<div class="empty"><p>No methods selected. Add up to three from the method library.</p><a href="#catalog">Choose methods ↑</a></div>'; return; }
  const rows = [
    ['Status / layer', m => `${m.status === 'implemented' ? 'Implemented' : 'Research only'} · ${m.layer}`],
    ['How it works', m => m.how], ['Output',m=>m.output], ['Setup / calibration',m=>m.setup],
    ['Strength',m=>m.strength], ['Limitation',m=>m.limit], ['Existing evidence',m=>m.evidence],
    ['Human accuracy',()=> 'Not measured in this project.'], ['Next fair comparison',m=>m.next],
  ];
  $('comparison-table').innerHTML = `<table class="comparison"><caption>Selected methods: implementation, tradeoffs and evidence</caption><thead><tr><th scope="col">Comparison dimension</th>${chosen.map(m=>`<th scope="col">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label,get])=>`<tr><th scope="row">${label}</th>${chosen.map(m=>`<td>${esc(get(m))}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">Source directory</th>${chosen.map(m=>`<td>${link(m.path,m.path)}</td>`).join('')}</tr><tr><th scope="row">Try / inspect</th>${chosen.map(m=>`<td>${demo(m)}</td>`).join('')}</tr></tbody></table>`;
}
function reset(all = false) {
  status = all ? 'all' : 'implemented'; $('scenario').value = $('layer').value = 'all'; $('search').value = '';
  document.querySelectorAll('[data-status]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.status === status)));
  renderCards();
}
$('revision').textContent = baseline;
$('implemented-count').textContent = methods.filter(m=>m.status==='implemented').length;
$('research-count').textContent = methods.filter(m=>m.status==='research').length;
$('research-link').href = repo + 'docs/research.md';
$('directory-table').innerHTML = `<table class="directories"><caption>Repository implementation directories</caption><thead><tr><th scope="col">Directory</th><th scope="col">Responsibility</th></tr></thead><tbody>${directoryMap.map(([path,purpose])=>`<tr><td>${link(path,path)}</td><td>${esc(purpose)}</td></tr>`).join('')}</tbody></table>`;
for (const id of ['scenario','layer']) $(id).addEventListener('change',renderCards);
$('search').addEventListener('input',renderCards);
$('reset').addEventListener('click',()=>reset());
$('show-all').addEventListener('click',()=>reset(true));
$('clear').addEventListener('click',()=>{ selected.clear(); $('selection-message').textContent = ''; renderCards(); renderComparison(); });
for (const button of document.querySelectorAll('[data-status]')) button.addEventListener('click',()=>{
  status = button.dataset.status;
  document.querySelectorAll('[data-status]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  renderCards();
});
renderCards(); renderComparison();
