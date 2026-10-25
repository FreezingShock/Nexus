// The top bar menu: a hamburger that opens a dropdown of rows, drawn like the title screen's left card: a coloured icon
// tile, the name, a live line under it and the key that opens it. Other modules add their buttons to the menu (they insert
// them before Settings); this one puts them in order, dresses them as rows and keeps their lines fresh while it is open.
// Goals, Paint town, Shortcuts and Settings open as notebook pages in the middle of the screen (src/ui/book.js); Time of
// day locks the sky and Photo mode lifts the camera. Closes with a click on a row, a click elsewhere, Esc or a right-click.
// Opening it closes any other top-right surface, and opening one of those closes it (see slot.js). Reads, never sends.
import { $ } from '../format.js';
import { topRight } from '../slot.js';
import { book } from '../book.js';
import { BALANCE } from '../../sim/balance.js';
import { summary } from '../../sim/achievements.js';
import { PAGE_ICONS } from '../page-icons.js';

// Top to bottom. gap draws a dashed rule above a row; page is the notebook page the row opens.
export const MENU_ROWS = [
  { id: 'goalsbtn', label: 'Goals and milestones', key: 'G', c: '#D3E4C4', page: 'goals', icon: PAGE_ICONS.goals },
  { id: 'night', label: 'Time of day', c: '#F6DDA0', icon: PAGE_ICONS.sky, gap: true },
  { id: 'paintbtn', label: 'Paint town', c: '#F2D9A6', page: 'paint', icon: PAGE_ICONS.paint, sub: 'One brush for every wall and roof' },
  { id: 'photobtn', label: 'Photo mode', key: 'O', c: '#E8D9EC', icon: PAGE_ICONS.photo, sub: 'Filters, viewpoints and a slow camera' },
  { id: 'keysbtn', label: 'Shortcuts', key: '/', c: '#D2E3EE', page: 'shortcuts', icon: PAGE_ICONS.shortcuts, sub: 'Every key on one page', gap: true },
  { id: 'settingsbtn', label: 'Settings', c: '#E4D5B2', page: 'settings', icon: PAGE_ICONS.settings, sub: 'Sky, graphics, sound and saves' },
];

export default {
  id: 'menu',
  order: 100,
  create({ sim }) {
    const btn = $('menubtn'), menu = $('menu'), wrap = $('ctrlwrap'), grid = $('menugrid');
    if (!btn || !menu || !grid) return {};
    const s = sim.state;

    // Dress every button as a row, in MENU_ROWS order. Its own pieces (Goals' charge bar, the new-stage dot) move along.
    for (const r of MENU_ROWS) {
      const b = $(r.id);
      if (!b || !b.querySelector) continue;
      const own = b.querySelector('svg,.qmark');
      const extras = [...b.querySelectorAll('.chg,.dot')];
      b.classList.add('mrow');
      b.style.setProperty('--c', r.c);
      b.innerHTML = `<span class="mi-ico">${r.icon || (own ? own.outerHTML : '')}</span><span class="mi-text"><b>${r.label}</b><small class="mi-sub">${r.sub || ''}</small></span>${r.key ? `<kbd>${r.key}</kbd>` : ''}`;
      const text = b.querySelector('.mi-text');
      for (const x of extras) (x.classList.contains('chg') ? text : b).appendChild(x);
      if (r.gap) grid.appendChild(Object.assign(document.createElement('hr'), { className: 'mgap' }));
      grid.appendChild(b);
    }

    const sub = (id, text) => { const el = $(id) && $(id).querySelector('.mi-sub'); if (el && el.textContent !== text) el.textContent = text; };
    function paintLines() {
      const sum = summary(s), ch = Math.round((s.charge / BALANCE.charge.max) * 100);
      sub('goalsbtn', 'Charge ' + ch + '% · ' + sum.stages + ' of ' + sum.totalStages + ' stages');
      const night = $('night');
      sub('night', (night.dataset.sub || 'Follows the clock') + ' · click to change');
    }

    let open = false, acc = 0;
    function setOpen(on) {
      if (on) { topRight.claim('menu'); paintLines(); } // one top-right surface at a time
      open = on;
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    }
    topRight.register('menu', { isOpen: () => open, close: () => setOpen(false), el: menu });
    btn.addEventListener('click', () => setOpen(!open));
    // A row does its own job first; the menu then tucks away so the town and the page it opened are in view.
    // Time of day stays open, so a player can click through night, day and the clock and watch the line change.
    menu.addEventListener('click', (e) => {
      const row = e.target.closest('.mrow');
      if (!row) return;
      if (row.id === 'night') { setTimeout(paintLines, 0); return; }
      setTimeout(() => setOpen(false), 0);
    });
    menu.addEventListener('pointerover', (e) => { const r = e.target.closest('.mrow'); if (r && !r.contains(e.relatedTarget)) book.hover(); });
    // The row of the open page is marked, so the menu shows where you are.
    book.watch((page) => {
      for (const r of MENU_ROWS) if (r.page) { const b = $(r.id); if (b) b.setAttribute('aria-expanded', String(r.page === page)); }
    });
    // Esc closes only the menu, not also a tool or a selection behind it.
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } });
    document.addEventListener('contextmenu', () => { if (open) setOpen(false); });
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
    return {
      frame(dt) { if (!open) return; acc += dt; if (acc > 1) { acc = 0; paintLines(); } },
    };
  },
};
