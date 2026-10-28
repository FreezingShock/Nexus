// The Controls and Access tabs of the Settings page. Both are lists of rows read from a spec: a segmented choice, a
// switch or a slider. Each change writes through its store (core/prefs.js), which saves it and applies it live.
// Sliders update in place while dragged, so the element is never rebuilt under the pointer.
import { CONTROL_SPECS } from '../core/controls.js';
import { ACCESS_SPECS } from '../core/access.js';

const pct = (v) => (Math.round(v * 100) / 100) + '×';

export const CONTROL_ROWS = [
  { title: 'Moving the camera', rows: [
    { key: 'panSpeed', label: 'Pan speed', hint: 'Dragging the map and the W A S D keys.', kind: 'slider', out: pct },
    { key: 'turnSpeed', label: 'Turn speed', hint: 'The Q and E keys, and shift-drag.', kind: 'slider', out: pct },
    { key: 'zoomSpeed', label: 'Zoom speed', hint: 'The mouse wheel.', kind: 'slider', out: pct },
    { key: 'invertZoom', label: 'Wheel zooms the other way', kind: 'switch' },
  ] },
  { title: 'Hints', rows: [
    { key: 'keyHint', label: 'Show the "/ for shortcuts" hint', kind: 'switch' },
  ] },
];

export const ACCESS_ROWS = [
  { title: 'Reading', rows: [
    { key: 'text', label: 'Text size', hint: 'Makes the top bar, tool bar, cards and pages bigger.', kind: 'seg', text: { normal: 'Normal', large: 'Large', larger: 'Larger' } },
  ] },
  { title: 'Motion', rows: [
    { key: 'motion', label: 'Moving things', hint: 'Calm stills page flips, floating numbers, hearts and sparkles.', kind: 'seg', text: { follow: 'Like my computer', calm: 'Keep it calm' } },
  ] },
  { title: 'Colour', rows: [
    { key: 'colors', label: 'Traffic colours', hint: 'The free, busy and jammed tint on the roads. These sets also change in lightness, so they read in greys.', kind: 'seg',
      text: { standard: 'Standard', redgreen: 'Red-green safe', blueyellow: 'Blue-yellow safe' }, preview: true },
  ] },
];

const swatches = () => `<span class="acc-prev" aria-hidden="true"><i style="background:var(--tr-free)"></i><i style="background:var(--tr-busy)"></i><i style="background:var(--tr-jam)"></i><small>Free · Busy · Jammed</small></span>`;

function rowHtml(r, specs, v) {
  const hint = r.hint ? `<small class="sub">${r.hint}</small>` : '';
  if (r.kind === 'switch') {
    return `<button class="gfx-sw" type="button" role="switch" data-sw="${r.key}" aria-checked="${String(!!v[r.key])}"><span>${r.label}</span><i aria-hidden="true"></i></button>`;
  }
  if (r.kind === 'slider') {
    const s = specs[r.key], p = Math.round(((v[r.key] - s.min) / (s.max - s.min)) * 100);
    return `<label class="gfx-row pf-row"><span class="gfx-label">${r.label}</span>${hint}
      <span class="snd-row"><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${v[r.key]}" data-range="${r.key}" style="--fill:${p}%" aria-valuetext="${r.out(v[r.key])}"><output data-out="${r.key}">${r.out(v[r.key])}</output></span></label>`;
  }
  const opts = Object.entries(r.text).map(([val, t]) => `<button class="gfx-opt" type="button" data-key="${r.key}" data-value="${val}" aria-pressed="${String(v[r.key] === val)}">${t}</button>`).join('');
  return `<div class="gfx-row pf-row"><span class="gfx-label">${r.label}</span>${hint}<div class="gfx-seg" role="group" aria-label="${r.label}">${opts}</div>${r.preview ? swatches() : ''}</div>`;
}

export function prefsMarkup(groups, specs, v, extra = '') {
  return groups.map((g) => `<section class="pf-group"><h3 class="nb-h3 h-disp">${g.title}</h3><div class="pf-rows">${g.rows.map((r) => rowHtml(r, specs, v)).join('')}</div></section>`).join('') + extra;
}

// Draws the rows into `el` and keeps them in step with the store. One handler per mount.
function mountPrefs(el, store, groups, specs, extra, onButton) {
  const rows = groups.flatMap((g) => g.rows);
  const paint = () => { el.innerHTML = prefsMarkup(groups, specs, store.get(), extra); };
  el.onclick = (e) => {
    const sw = e.target.closest('[data-sw]'), opt = e.target.closest('[data-key]'), pf = e.target.closest('[data-pf]');
    if (pf && el.contains(pf)) { onButton && onButton(pf.dataset.pf, paint); return; }
    let again = null;
    if (sw && el.contains(sw)) { store.set(sw.dataset.sw, !store.get()[sw.dataset.sw]); again = `[data-sw="${sw.dataset.sw}"]`; }
    else if (opt && el.contains(opt)) { store.set(opt.dataset.key, opt.dataset.value); again = `[data-key="${opt.dataset.key}"][data-value="${opt.dataset.value}"]`; }
    else return;
    paint();
    const back = el.querySelector(again);
    if (back) back.focus({ preventScroll: true }); // keep keyboard users where they were
  };
  el.oninput = (e) => {
    const input = e.target.closest('[data-range]');
    if (!input || !el.contains(input)) return;
    const k = input.dataset.range, r = rows.find((x) => x.key === k);
    store.set(k, Number(input.value));
    const v = store.get()[k], s = specs[k];
    input.style.setProperty('--fill', Math.round(((v - s.min) / (s.max - s.min)) * 100) + '%');
    input.setAttribute('aria-valuetext', r.out(v));
    const out = el.querySelector(`[data-out="${k}"]`);
    if (out) out.textContent = r.out(v);
  };
  paint();
  return paint;
}

export function mountControls(el, store, { openKeys }) {
  const extra = `<div class="nb-btns pf-btns"><button class="btn" type="button" data-pf="keys">See all the keys</button><button class="btn" type="button" data-pf="reset">Back to the usual</button></div>`;
  mountPrefs(el, store, CONTROL_ROWS, CONTROL_SPECS, extra, (what, paint) => {
    if (what === 'keys') openKeys();
    else { store.reset(); paint(); }
  });
}

export function mountAccess(el, store) { mountPrefs(el, store, ACCESS_ROWS, ACCESS_SPECS, ''); }
