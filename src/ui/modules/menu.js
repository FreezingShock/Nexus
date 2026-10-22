// The top bar menu: a hamburger that opens a panel of labelled, coloured tiles for every button that is not time control
// (day and night, Milestones, Goals, Shortcuts, Settings). Other modules add their own buttons to the grid (they insert
// them before Settings); this one names them and handles open and close. It runs last so every tile is there to label.
// Closes with a click on a tile, a click elsewhere, Esc or a right-click. Opening it closes any other top-right surface
// (Settings, Milestones, the Inspect card), and opening one of those closes it (see slot.js). Reads nothing from the sim.
import { $ } from '../format.js';
import { topRight } from '../slot.js';

const LABELS = { night: 'Time of day', achvbtn: 'Milestones', goalsbtn: 'Goals', keysbtn: 'Shortcuts', settingsbtn: 'Settings' };

export default {
  id: 'menu',
  order: 100,
  create() {
    const btn = $('menubtn'), menu = $('menu'), wrap = $('ctrlwrap');
    if (!btn || !menu) return {};
    // Tiles show their name from data-label. Day and night also carries a line of state, which hud.js writes into data-sub.
    for (const b of menu.querySelectorAll('.ib')) {
      const name = LABELS[b.id];
      if (name) b.dataset.label = name;
      else if (!b.dataset.label) b.dataset.label = b.getAttribute('aria-label') || '';
    }

    let open = false;
    function setOpen(on) {
      if (on) topRight.claim('menu'); // one top-right surface at a time
      open = on;
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    }
    topRight.register('menu', { isOpen: () => open, close: () => setOpen(false), el: menu });
    btn.addEventListener('click', () => setOpen(!open));
    // A tile does its own job first; the menu then tucks away so the town and the card it opened are in view.
    menu.addEventListener('click', (e) => { if (e.target.closest('.ib')) setTimeout(() => setOpen(false), 0); });
    // Esc closes only the menu, not also a tool or a selection behind it.
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } });
    document.addEventListener('contextmenu', () => { if (open) setOpen(false); });
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
    return {};
  },
};
