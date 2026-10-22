// The Sound section of the Settings card: a mute switch and four volume sliders. Sliders update in place while dragged,
// so the element is never rebuilt under the pointer. Each change goes through the store (audio/mix.js), which saves it
// for this browser and tells the engine.
import { VOLUMES } from '../audio/mix.js';

const LABEL = { master: 'Master', music: 'Music', effects: 'Effects', ambience: 'Ambience' };

export function soundMarkup(s) {
  const rows = VOLUMES.map((k) => {
    const pct = Math.round(s[k] * 100);
    return `<label class="snd-row"><span class="snd-label">${LABEL[k]}</span>
      <input type="range" min="0" max="100" step="5" value="${pct}" data-vol="${k}" aria-valuetext="${pct}%"${s.muted ? ' disabled' : ''}>
      <output data-out="${k}">${pct}%</output></label>`;
  }).join('');
  return `<section class="snd" aria-label="Sound">
    <h3 class="h-disp">Sound</h3>
    <button class="gfx-sw" role="switch" data-mute aria-checked="${String(!!s.muted)}"><span>Mute all sound</span><i aria-hidden="true"></i></button>
    <div class="snd-rows">${rows}</div>
    <p class="sub snd-note">Sound starts after your first click or key press, as browsers ask. Your settings are kept in this browser.</p>
  </section>`;
}

// Draws the section into `el` and keeps it in step with the store. Mounting again replaces the old listener.
export function mountSound(el, store) {
  if (el._unsub) el._unsub();
  el.innerHTML = soundMarkup(store.get());
  const sync = (s) => {
    const sw = el.querySelector('[data-mute]');
    if (sw) sw.setAttribute('aria-checked', String(!!s.muted));
    for (const k of VOLUMES) {
      const input = el.querySelector(`[data-vol="${k}"]`);
      if (!input) continue;
      const pct = Math.round(s[k] * 100);
      if (document.activeElement !== input) input.value = String(pct);
      input.disabled = !!s.muted;
      input.setAttribute('aria-valuetext', pct + '%');
      const out = el.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = pct + '%';
    }
  };
  el.onclick = (e) => {
    const b = e.target.closest('[data-mute]');
    if (b && el.contains(b)) store.toggleMute();
  };
  el.oninput = (e) => {
    const input = e.target.closest('[data-vol]');
    if (input && el.contains(input)) store.set(input.dataset.vol, Number(input.value) / 100);
  };
  el._unsub = store.subscribe(sync);
}
