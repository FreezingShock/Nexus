// Top HUD: the town plaque (badge, name and a line about the town), Coins and Parts, the hover cards on each plaque,
// pause / speed / time / settings buttons, and toasts. Numbers sit in fixed-width boxes, so a changing digit never moves the row.
import { $, fmtCompact, fmtRateCompact } from './format.js';
import { townIconSvg, townColor } from './town-icons.js';
import { coinsCard, partsCard, townSnap } from './hud-detail.js';
import { plaqueLine, townHoverHtml } from './town-view.js';

export function createHud({ sim, send, onSettings, calendar }) {
  let acc = 0;
  const s = sim.state;
  // Amounts already in the sim but still flying in from the postcard (collect-fx.js). The counters leave them out until
  // each icon lands, so the number climbs as they arrive.
  const held = { coins: 0, parts: 0 };
  const CHIP = { coins: 'coinschip', parts: 'partschip' };
  function paintRes() {
    const d = sim.display(1);
    $('coins').textContent = fmtCompact(Math.max(0, d.coins - held.coins));
    $('parts').textContent = fmtCompact(Math.max(0, d.parts - held.parts));
  }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // Toasts are drawn by the notes module (src/ui/modules/notes.js), which plugs itself in with useToasts.
  let toastSink = null;
  function toast(text, kind) { if (toastSink) toastSink(text, kind); }

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
    $('night').dataset.sub = LOCK_SUB[lock];
    $('rate').textContent = fmtRateCompact(sim.rate());
    $('prate').textContent = fmtRateCompact(sim.partsRate());
    paintTown();
    paintCards();
  }
  sync();

  return {
    toast, sync,
    useToasts(fn) { toastSink = fn; },
    // Hold an amount back from a counter; land(key, share) lets part of it in, with a squish, and `tag` pops "+amount".
    // Holds add up, so a reward strip and the postcard can fly at once.
    hold(key, amount) { held[key] += Math.max(0, amount || 0); paintRes(); },
    land(key, share, tag) {
      held[key] = tag ? 0 : Math.max(0, held[key] - share);
      paintRes();
      const chip = $(CHIP[key]);
      restart(chip, 'got');
      if (tag) {
        const t = document.createElement('span');
        t.className = 'got-tag'; t.textContent = tag;
        chip.appendChild(t);
        setTimeout(() => t.remove(), 1400);
      }
    },
    badgeOf: (key) => $(CHIP[key]).querySelector('.badge'),
    // Called every frame; the DOM is only touched five times a second.
    frame(dt, alpha, force) {
      acc += dt;
      if (acc < 0.2 && !force) return false;
      acc = 0;
      const d = sim.display(alpha);
      $('coins').textContent = fmtCompact(Math.max(0, d.coins - held.coins));
      $('parts').textContent = fmtCompact(Math.max(0, d.parts - held.parts));
      paintTown(); // the line under the name follows the population
      paintCards();
      return true;
    },
  };
}
