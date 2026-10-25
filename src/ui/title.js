// The title screen and the progress screen (markup is in index.html, styles in css/title.css). This file only drives
// them: main.js feeds it the load progress and is told when Play, New town or the options are chosen.
import { $ } from './format.js';
import { VERSION, CHANGES } from '../version.js';
import { CREDITS, saveLine } from '../core/boot.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRESET_LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

export function createTitle({ onPlay, onNewTown }) {
  const title = $('title'), boot = $('boot'), pane = $('tt-pane'), play = $('tt-play');
  const opts = { howto: $('tt-howto'), settings: $('tt-settings'), changes: $('tt-changes'), credits: $('tt-credits'), new: $('tt-new') };
  let ready = false, open = null, stores = null;

  $('tt-ver').textContent = 'v' + VERSION;

  // ---- the option panels: one at a time, opening inside the card over the list
  const k = (t) => `<kbd>${t}</kbd>`;
  const panes = {
    settings: () => {
      const q = stores.quality.get(), s = stores.sound.get();
      return `<h3 class="h-disp">Settings</h3>
        <dl><dt>Graphics</dt><dd><div class="tt-chips" data-k="preset">${Object.keys(PRESET_LABEL).map((n) =>
          `<button class="tt-chip" type="button" data-v="${n}" aria-pressed="${q.preset === n}">${PRESET_LABEL[n]}</button>`).join('')}</div>
          <small class="sub">Low and Medium keep older computers smooth. High is the town as drawn.</small></dd>
        <dt>Sound</dt><dd><div class="tt-chips" data-k="sound">
          <button class="tt-chip" type="button" data-v="on" aria-pressed="${!s.muted}">On</button>
          <button class="tt-chip" type="button" data-v="off" aria-pressed="${s.muted}">Muted</button></div>
          <small class="sub">Music and the sounds of the town start once you press Play.</small></dd></dl>
        <p class="sub">Volumes, seasons, weather and more wait in the town, under the menu.</p>`;
    },
    howto: () => `<h3 class="h-disp">How to play</h3>
        <dl><dt>Look around</dt><dd>Drag to pan, scroll to zoom, ${k('Q')} ${k('E')} to turn. ${k('W')}${k('A')}${k('S')}${k('D')} pan too, and ${k('F')} flies low through the streets.</dd></dl>
        <dl><dt>Build</dt><dd>${k('R')} roads, ${k('Z')} zones, ${k('B')} buildings, ${k('C')} services, ${k('P')} parks, ${k('Y')} decor, ${k('N')} districts. ${k('X')} bulldozes. Right-click cancels.</dd></dl>
        <dl><dt>Grow</dt><dd>Coins and Parts arrive on their own, even while you are away, and you meet them again on a postcard. Click a building to upgrade it. ${k('M')} shows your goals.</dd></dl>
        <dl><dt>Keep and share</dt><dd>${k('K')} opens the calendar, ${k('O')} the photo mode. Your town saves itself every 45 seconds and can be exported from Settings.</dd></dl>
        <p class="sub">Nothing here ever punishes you. Take your time.</p>`,
    changes: () => `<h3 class="h-disp">Changes</h3>${CHANGES.map((c) =>
      `<dl><dt>Version ${esc(c.v)}</dt><dd><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></dd></dl>`).join('')}`,
    credits: () => `<h3 class="h-disp">Credits</h3>${CREDITS.map((c) =>
      `<dl><dt>${esc(c.head)}</dt>${c.lines.map((l) => `<dd>${esc(l)}</dd>`).join('')}</dl>`).join('')}`,
    new: () => `<h3 class="h-disp">Start a new town?</h3>
        <p>You begin again with the small starter village. Your current town moves to the backup slot, and Settings in the town can bring it back.</p>
        <div class="tt-row-btns"><button class="btn" type="button" data-act="cancel">Keep my town</button><button class="btn primary" type="button" data-act="new">Start fresh</button></div>`,
  };
  const BACK = '<button class="tt-back" type="button" data-act="cancel">‹ Back</button>';
  function show(name) {
    if (open === name) name = null;
    const was = open;
    open = name;
    for (const [n, b] of Object.entries(opts)) b.setAttribute('aria-expanded', String(n === name));
    if (!name) { pane.hidden = true; if (was) opts[was].focus({ preventScroll: true }); return; } // the old text stays while it fades
    pane.innerHTML = BACK + panes[name]();
    pane.scrollTop = 0;
    pane.hidden = false;
    pane.querySelector('.tt-back').focus({ preventScroll: true });
  }
  for (const n of Object.keys(opts)) opts[n].addEventListener('click', () => show(n));
  pane.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') return show(null);
    if (b.dataset.act === 'new') { b.disabled = true; onNewTown(); return; }
    const group = b.parentElement.dataset.k;
    if (group === 'preset') stores.quality.choose(b.dataset.v);
    if (group === 'sound') stores.sound.set('muted', b.dataset.v === 'off');
    if (group) { const top = pane.scrollTop; pane.innerHTML = BACK + panes.settings(); pane.scrollTop = top; }
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) show(null); });

  play.addEventListener('click', () => { if (ready) onPlay(); });

  return {
    // What the save holds, once it is read: the line under Play, and whether there is a town to start over from.
    saveInfo(source, savedAgo) {
      $('tt-save').textContent = saveLine(source, savedAgo);
      opts.new.hidden = source === 'new';
    },
    // While the town warms up: the Play button waits, with a slim bar under it.
    warm(fraction) {
      const pct = Math.round(fraction * 100);
      $('tt-warmbar').style.width = pct + '%';
      $('tt-warm').setAttribute('aria-valuenow', String(pct));
    },
    ready(s) {
      stores = s; ready = true;
      play.disabled = false; $('tt-playlabel').textContent = 'Play';
      $('tt-warm').classList.add('ready');
      opts.settings.disabled = false; opts.new.disabled = false;
      play.focus({ preventScroll: true });
    },
    failed(message) { $('tt-playlabel').textContent = 'Cannot start'; $('tt-save').textContent = message; $('tt-warm').classList.add('ready'); },
    hideTitle() { if (open) show(null); title.hidden = true; },
    // 0..1: how much of the paper curtain covers the town (it hides the cuts between camera shots).
    curtain(v) { $('tt-curtain').style.opacity = String(v); },
    showBoot(steps) {
      $('bt-steps').innerHTML = steps.map((s) => `<li data-id="${s.id}" data-s="todo">${esc(s.caption)}</li>`).join('');
      boot.hidden = false;
    },
    // Called every frame while the progress screen is up: `shown` is the smoothed bar, `progress` the tracker.
    bootFrame(shown, progress) {
      const pct = Math.round(shown * 100);
      $('bt-fill').style.width = pct + '%';
      $('bt-house').style.left = pct + '%';
      $('bt-track').setAttribute('aria-valuenow', String(pct));
      $('bt-cap').textContent = progress.caption() + (progress.isDone() ? '' : '…');
      for (const s of progress.steps()) { const li = $('bt-steps').querySelector('[data-id="' + s.id + '"]'); if (li && li.dataset.s !== s.state) li.dataset.s = s.state; }
    },
    hideBoot() { boot.hidden = true; },
  };
}
