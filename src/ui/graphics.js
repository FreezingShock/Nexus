// The Graphics section of the Settings card: four presets, the individual options, and two switches. Changing an
// option marks the preset Custom. Each click writes through the store (core/quality.js), which applies it live.
import { OPTIONS } from '../core/quality.js';

const PRESET_LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
const ROWS = [
  { key: 'shadowSize', label: 'Shadow detail', needs: 'shadows', text: { 1024: '1K', 2048: '2K', 4096: '4K' } },
  { key: 'pixelRatio', label: 'Sharpness', text: { 1: '1×', 1.25: '1.25×', 1.5: '1.5×', 2: '2×' } },
  { key: 'effects', label: 'Dust, hearts and town life', text: { off: 'Off', light: 'Light', full: 'Full' } },
  { key: 'crowd', label: 'Traffic and people', text: { light: 'Light', normal: 'Normal', busy: 'Busy' } },
];
const SWITCHES = [
  { key: 'shadows', label: 'Shadows' },
  { key: 'edges', label: 'Ink edges on vehicles' },
  { key: 'stats', label: 'Frame and draw-call readout' },
];

export function graphicsMarkup(q) {
  const presets = Object.keys(PRESET_LABEL).map((p) =>
    `<button class="gfx-opt" data-preset="${p}" aria-pressed="${String(q.preset === p)}">${PRESET_LABEL[p]}</button>`).join('');
  const rows = ROWS.map((r) => {
    const off = r.needs && !q[r.needs];
    const opts = Object.entries(r.text).map(([v, t]) =>
      `<button class="gfx-opt" data-key="${r.key}" data-value="${v}" aria-pressed="${String(String(q[r.key]) === v)}"${off ? ' disabled' : ''}>${t}</button>`).join('');
    return `<div class="gfx-row${off ? ' is-off' : ''}"><span class="gfx-label">${r.label}</span><div class="gfx-seg" role="group" aria-label="${r.label}">${opts}</div></div>`;
  }).join('');
  const switches = SWITCHES.map((s) =>
    `<button class="gfx-sw" role="switch" data-switch="${s.key}" aria-checked="${String(!!q[s.key])}"><span>${s.label}</span><i aria-hidden="true"></i></button>`).join('');
  const note = q.preset === 'custom' ? 'Custom: you changed an option, so no preset is selected.' : 'Preset: ' + PRESET_LABEL[q.preset] + '.';
  return `<section class="gfx" aria-label="Graphics">
    <h3 class="h-disp">Graphics</h3>
    <div class="gfx-presets" role="group" aria-label="Graphics preset">${presets}</div>
    <p class="sub gfx-note">${note}</p>
    ${rows}
    <div class="gfx-switches">${switches}</div>
  </section>`;
}

// Draws the section into `el` and keeps it in step with the store. One click handler, set once per mount.
export function mountGraphics(el, store) {
  const paint = () => { el.innerHTML = graphicsMarkup(store.get()); };
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    let changed = false, again = null;
    if (b.dataset.preset) {
      changed = store.choose(b.dataset.preset);
      again = `[data-preset="${b.dataset.preset}"]`;
    } else if (b.dataset.switch) {
      const k = b.dataset.switch;
      changed = store.set(k, !store.get()[k]);
      again = `[data-switch="${k}"]`;
    } else if (b.dataset.key) {
      const key = b.dataset.key;
      const val = OPTIONS[key].values.find((v) => String(v) === b.dataset.value);
      changed = val !== undefined && store.set(key, val);
      again = `[data-key="${key}"][data-value="${b.dataset.value}"]`;
    }
    if (!changed) return;
    paint();
    const back = again && el.querySelector(again);
    if (back && !back.disabled) back.focus({ preventScroll: true }); // keep keyboard users where they were
  };
  paint();
}
