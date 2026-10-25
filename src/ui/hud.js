// Top HUD: the town plaque (badge, name and a line about the town), Coins and Parts, the hover cards on each plaque,
// pause / speed / time / settings buttons, and toasts. Numbers sit in fixed-width boxes, so a changing digit never moves the row.
import { $, fmtCompact, fmtRateCompact } from './format.js';
import { townIconSvg, townColor } from './town-icons.js';
import { coinsCard, partsCard, townSnap } from './hud-detail.js';
import { plaqueLine, townHoverHtml } from './town-view.js';

export function createHud({ sim, send, onSettings, calendar }) {
  let acc = 0, toastTimer = 0;
  const s = sim.state;

  function toast(text) {
    const el = $('toast');
    el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  $('pause').onclick = () => send({ type: 'togglePause' });
  $('speed').onclick = () => send({ type: 'cycleSpeed' });
  // Time of day: the sky follows the clock, and this button locks it to night, then day, then back to the cycle.
  const NEXT_LOCK = { auto: 'night', night: 'day', day: 'auto' }, LOCK_TEXT = { auto: 'Time of day: cycle', night: 'Time of day: night locked', day: 'Time of day: day locked' };
  const LOCK_SUB = { auto: 'Follows the clock', night: 'Locked to night', day: 'Locked to day' };
  $('night').onclick = () => {
    if (!calendar) return;
    const lock = NEXT_LOCK[calendar.get().timeLock] || 'auto';
    calendar.set('timeLock', lock);
    toast(LOCK_TEXT[lock]);
    sync();
  };
  $('settingsbtn').onclick = onSettings;

  // ---- town plaque: badge, name and a small line. Renaming and the badge live on the town page (modules/town-page.js),
  // which a click on the plaque opens; hovering shows a snapshot of the town.
  const plaque = $('townplaque'), nameEl = $('townname'), lineEl = $('townline'), badge = $('townbadge');
  const pops = { town: $('townpop'), coins: $('coinspop'), parts: $('partspop') };
  const lastPop = {};
  let lastTown = '';

  function paintTown() {
    const t = s.town, pp = sim.population;
    const line = plaqueLine({ people: pp ? pp.people() : 0, year: s.year });
    if (lineEl.textContent !== line) lineEl.textContent = line;
    const key = t.name + '|' + t.icon + '|' + t.color;
    if (key === lastTown) return;
    lastTown = key;
    nameEl.textContent = t.name;
    // The plaque grows to fit the name; a longer one steps the type down so it still shows in full.
    const len = [...t.name].length;
    plaque.dataset.len = len > 18 ? 'long' : len > 12 ? 'mid' : 'short';
    plaque.setAttribute('aria-label', 'Town page: ' + t.name);
    badge.innerHTML = townIconSvg(t.icon, 28);
    badge.style.background = townColor(t.color);
  }

  // Keep each hover card inside the window: shift it sideways when it would run off either edge.
  function clampCard(plaque) {
    const pop = plaque.querySelector(':scope > .pop');
    if (!pop) return;
    pop.style.marginLeft = '';
    const r = pop.getBoundingClientRect(), m = 8;
    const shift = r.left < m ? m - r.left : r.right > innerWidth - m ? innerWidth - m - r.right : 0;
    if (shift) pop.style.marginLeft = shift + 'px';
  }
  for (const p of document.querySelectorAll('.plaque')) {
    p.addEventListener('pointerenter', () => clampCard(p));
    p.addEventListener('focusin', () => clampCard(p));
  }

  // ---- hover cards: the text is only rewritten when it changes, so a card can be read while the numbers move
  function paintPop(key, html) {
    if (lastPop[key] === html) return;
    lastPop[key] = html;
    pops[key].innerHTML = html;
  }
  function paintCards() {
    const bd = sim.breakdown ? sim.breakdown() : { coins: {}, parts: {}, mult: {} };
    paintPop('town', townHoverHtml(townSnap(sim)));
    paintPop('coins', coinsCard(s, sim.rate(), bd));
    paintPop('parts', partsCard(s, sim.partsRate(), bd));
  }

  function sync() {
    $('pause').setAttribute('aria-pressed', String(s.paused));
    $('speed').textContent = s.speed + '×';
    const lock = calendar ? calendar.get().timeLock : 'auto';
    $('night').setAttribute('aria-pressed', String(lock !== 'auto'));
    $('night').setAttribute('aria-label', LOCK_TEXT[lock]);
    $('night').dataset.label = 'Time of day'; // the menu tile's name, and under it the state
    $('night').dataset.sub = LOCK_SUB[lock];
    $('rate').textContent = fmtRateCompact(sim.rate());
    $('prate').textContent = fmtRateCompact(sim.partsRate());
    paintTown();
    paintCards();
  }
  sync();

  return {
    toast, sync,
    // Called every frame; the DOM is only touched five times a second.
    frame(dt, alpha, force) {
      acc += dt;
      if (acc < 0.2 && !force) return false;
      acc = 0;
      const d = sim.display(alpha);
      $('coins').textContent = fmtCompact(d.coins);
      $('parts').textContent = fmtCompact(d.parts);
      paintCards();
      return true;
    },
  };
}
