// Top HUD: the town plaque (name and badge), Coins and Parts, the Renewal chip, the hover cards on each plaque,
// pause / speed / time / settings buttons, and toasts. Numbers sit in fixed-width boxes, so a changing digit never moves the row.
import { $, fmtCompact, fmtRateCompact } from './format.js';
import { TOWN_COLORS, TOWN_ICONS, TOWN_NAME_MAX, cleanName } from '../sim/town.js';
import { ICON_LABEL, COLOR_LABEL, townIconSvg, townColor } from './town-icons.js';
import { coinsCard, partsCard, renewalCard, townCard } from './hud-detail.js';

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
  const LOCK_SHORT = { auto: 'Sky: cycling', night: 'Sky: night', day: 'Sky: day' };
  $('night').onclick = () => {
    if (!calendar) return;
    const lock = NEXT_LOCK[calendar.get().timeLock] || 'auto';
    calendar.set('timeLock', lock);
    toast(LOCK_TEXT[lock]);
    sync();
  };
  $('settingsbtn').onclick = onSettings;

  // ---- town plaque: rename inline, pick a badge
  const plaque = $('townplaque'), nameBtn = $('townname'), nameIn = $('townedit'), badge = $('townbadge'), pick = $('townpick');
  const pops = { town: $('townpop'), coins: $('coinspop'), parts: $('partspop'), renewal: $('renpop') };
  const lastPop = {};
  let editing = false, pickOpen = false, lastTown = '';
  nameIn.maxLength = TOWN_NAME_MAX;

  pick.innerHTML = '<h3>Town badge</h3>' +
    `<div class="tp-grid" role="group" aria-label="Icon">${TOWN_ICONS.map((n) => `<button class="tp-ic" data-icon="${n}" aria-pressed="false" aria-label="${ICON_LABEL[n]}" title="${ICON_LABEL[n]}">${townIconSvg(n, 30)}</button>`).join('')}</div>` +
    `<div class="tp-sw" role="group" aria-label="Badge colour">${Object.keys(TOWN_COLORS).map((c) => `<button class="tp-col" data-color="${c}" aria-pressed="false" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" style="background:${TOWN_COLORS[c]}"></button>`).join('')}</div>`;

  function paintTown() {
    const t = s.town;
    const key = t.name + '|' + t.icon + '|' + t.color;
    if (key === lastTown) return;
    lastTown = key;
    nameBtn.textContent = t.name;
    // The plaque grows to fit the name; a longer one steps the type down so it still shows in full.
    const len = [...t.name].length;
    plaque.dataset.len = len > 18 ? 'long' : len > 12 ? 'mid' : 'short';
    nameBtn.title = t.name;
    badge.innerHTML = townIconSvg(t.icon, 28);
    badge.style.background = townColor(t.color);
    badge.setAttribute('aria-label', `Town badge: ${ICON_LABEL[t.icon]}, ${COLOR_LABEL[t.color]}. Change it`);
    for (const b of pick.querySelectorAll('[data-icon]')) b.setAttribute('aria-pressed', String(b.dataset.icon === t.icon));
    for (const b of pick.querySelectorAll('[data-color]')) b.setAttribute('aria-pressed', String(b.dataset.color === t.color));
  }

  function startRename() {
    if (editing) return;
    editing = true;
    plaque.style.width = plaque.offsetWidth + 'px'; // the plaque holds its width while the field is open
    nameIn.value = s.town.name;
    nameBtn.hidden = true; nameIn.hidden = false;
    nameIn.focus(); nameIn.select();
  }
  // Enter or leaving the field keeps the name; Escape drops the edit. A blank name is never saved.
  function endRename(keep) {
    if (!editing) return;
    editing = false;
    plaque.style.width = '';
    const name = keep ? cleanName(nameIn.value) : null;
    nameIn.hidden = true; nameBtn.hidden = false;
    if (name && name !== s.town.name) send({ type: 'renameTown', name });
    sync();
  }
  nameBtn.onclick = startRename;
  nameIn.onkeydown = (e) => {
    e.stopPropagation(); // typing a name must not fire tool keys
    if (e.key === 'Enter') { e.preventDefault(); endRename(true); }
    else if (e.key === 'Escape') { e.preventDefault(); endRename(false); nameBtn.focus(); }
  };
  nameIn.onblur = () => endRename(true);

  function togglePicker(force) {
    pickOpen = force === undefined ? !pickOpen : force;
    pick.hidden = !pickOpen;
    badge.setAttribute('aria-expanded', String(pickOpen));
    if (pickOpen) pick.querySelector('[aria-pressed="true"]')?.focus();
  }
  badge.onclick = () => togglePicker();
  pick.onclick = (e) => {
    const ic = e.target.closest('[data-icon]'), col = e.target.closest('[data-color]');
    if (!ic && !col) return;
    send({ type: 'setTownBadge', icon: ic ? ic.dataset.icon : undefined, color: col ? col.dataset.color : undefined });
    sync();
  };
  addEventListener('pointerdown', (e) => {
    if (pickOpen && !pick.contains(e.target) && !badge.contains(e.target)) togglePicker(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pickOpen) { togglePicker(false); badge.focus(); }
  });

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
    paintPop('town', townCard(s));
    paintPop('coins', coinsCard(s, sim.rate(), bd));
    paintPop('parts', partsCard(s, sim.partsRate(), bd));
    paintPop('renewal', renewalCard(s));
  }

  function sync() {
    $('pause').setAttribute('aria-pressed', String(s.paused));
    $('speed').textContent = s.speed + '×';
    const lock = calendar ? calendar.get().timeLock : 'auto';
    $('night').setAttribute('aria-pressed', String(lock !== 'auto'));
    $('night').setAttribute('aria-label', LOCK_TEXT[lock]);
    $('night').dataset.label = LOCK_SHORT[lock]; // the menu tile's name
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
