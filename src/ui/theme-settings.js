// The Paper row on the Settings page's Graphics tab: light paper, dark paper, or whatever the computer prefers. Each
// click writes through the store (core/theme.js), which repaints the UI straight away.
import { MODES, MODE_LABEL } from '../core/theme.js';

export function themeMarkup(t) {
  const opts = MODES.map((m) => `<button class="gfx-opt" type="button" data-theme-mode="${m}" aria-pressed="${String(t.mode === m)}"><i class="pp-sw pp-${m}" aria-hidden="true"></i>${MODE_LABEL[m]}</button>`).join('');
  const now = t.mode === 'auto' ? `Your computer asks for ${t.look} paper right now.` : 'The town itself looks the same either way.';
  return `<div class="gfx-row pg-paper"><span class="gfx-label">Paper</span><div class="gfx-seg" role="group" aria-label="Paper">${opts}</div><small class="sub">${now}</small></div>`;
}

export function mountTheme(el, store) {
  const paint = () => { el.innerHTML = themeMarkup(store.get()); };
  el.onclick = (e) => {
    const b = e.target.closest('[data-theme-mode]');
    if (!b || !store.set(b.dataset.themeMode)) return;
    paint();
    const back = el.querySelector(`[data-theme-mode="${b.dataset.themeMode}"]`);
    if (back) back.focus({ preventScroll: true });
  };
  paint();
}
