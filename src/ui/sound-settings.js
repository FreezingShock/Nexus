// The Sound section of the Settings card: a mute switch, four volume sliders, and the tune playing with a Next tune button. Sliders update in place while dragged,
// so the element is never rebuilt under the pointer. Each change goes through the store (audio/mix.js), which saves it
// for this browser and tells the engine.
import { VOLUMES } from '../audio/mix.js';
import { nowPlaying, onNowPlaying, musicCommand } from '../audio/cuehub.js';

const LABEL = { master: 'Master', music: 'Music', effects: 'Effects', ambience: 'Ambience' };

// The line beside Next tune: the tune playing, or what the quiet between tunes is.
export function playingLine(title) {
  return title ? `Now playing: <b>${escapeHtml(title)}</b>` : 'Between tunes: the town hums along.';
}
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function soundMarkup(s) {
  const rows = VOLUMES.map((k) => {
    const pct = Math.round(s[k] * 100);
    return `<label class="snd-row"><span class="snd-label">${LABEL[k]}</span>
      <input type="range" min="0" max="100" step="5" value="${pct}" data-vol="${k}" style="--fill:${pct}%" aria-valuetext="${pct}%"${s.muted ? ' disabled' : ''}>
      <output data-out="${k}">${pct}%</output></label>`;
  }).join('');
  return `<section class="snd" aria-label="Sound">
    <button class="gfx-sw" role="switch" data-mute aria-checked="${String(!!s.muted)}"><span>Mute all sound</span><i aria-hidden="true"></i></button>
    <div class="snd-rows">${rows}</div>
    <div class="snd-now"><span data-now>${playingLine(nowPlaying())}</span>
      <button class="gfx-opt snd-next" data-next>Next tune</button></div>
    <p class="sub snd-note">Little tunes come and go with quiet stretches of town sound between them, and change with the time of day, the season and the weather.</p>
    <p class="sub snd-note">Sound starts after your first click or key press, as browsers ask. Your settings are kept in this browser.</p>
  </section>`;
}

// Draws the section into `el` and keeps it in step with the store. Mounting again replaces the old listener.
export function mountSound(el, store) {
  if (el._unsub) el._unsub();
  if (el._unnow) el._unnow();
  el.innerHTML = soundMarkup(store.get());
  const sync = (s) => {
    const sw = el.querySelector('[data-mute]');
    if (sw) sw.setAttribute('aria-checked', String(!!s.muted));
    for (const k of VOLUMES) {
      const input = el.querySelector(`[data-vol="${k}"]`);
      if (!input) continue;
      const pct = Math.round(s[k] * 100);
      if (document.activeElement !== input) input.value = String(pct);
      input.style.setProperty('--fill', pct + '%');
      input.disabled = !!s.muted;
      input.setAttribute('aria-valuetext', pct + '%');
      const out = el.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = pct + '%';
    }
  };
  const showNow = () => {
    const now = el.querySelector('[data-now]');
    if (now) now.innerHTML = playingLine(nowPlaying());
  };
  el.onclick = (e) => {
    const b = e.target.closest('[data-mute]');
    if (b && el.contains(b)) store.toggleMute();
    const n = e.target.closest('[data-next]');
    if (n && el.contains(n)) musicCommand('next');
  };
  el.oninput = (e) => {
    const input = e.target.closest('[data-vol]');
    if (input && el.contains(input)) store.set(input.dataset.vol, Number(input.value) / 100);
  };
  el._unsub = store.subscribe(sync);
  el._unnow = onNowPlaying(showNow);
}
