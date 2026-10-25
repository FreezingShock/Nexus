// The Shortcuts page: press ? (or Shortcuts in the menu) for every binding on one notebook page (src/ui/book.js).
// Built from src/ui/shortcuts.js, so it lists the real keys.
import { $ } from '../format.js';
import { SHORTCUT_GROUPS } from '../shortcuts.js';
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';

// A tint per group, in the order of SHORTCUT_GROUPS.
const TINTS = ['#D3E4C4', '#E4D5B2', '#F2C9BA', '#D2E3EE', '#F6DDA0'];

export function shortcutsHtml() {
  const groups = SHORTCUT_GROUPS.map((g, i) => {
    const rows = g.rows.map((r) => `<li><span class="kcaps">${r.keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span><span>${r.text}</span></li>`).join('');
    return `<section class="pg-box kgroup" style="--i:${i};--gc:${TINTS[i % TINTS.length]}"><h3 class="h-disp">${g.title}</h3><ul>${rows}</ul></section>`;
  }).join('');
  return `<div class="kgroups">${groups}</div>
    <div class="kfoot"><p class="nb-promise">Tips pop up as you play, the first time you meet something new. Want them again?</p>
    <button class="btn" type="button" data-act="tips">Show the tips again</button></div>`;
}

export default {
  id: 'shortcut-sheet',
  create({ toast }) {
    const btn = document.createElement('button');
    btn.className = 'ib';
    btn.id = 'keysbtn';
    btn.setAttribute('aria-label', 'Keyboard shortcuts');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="qmark" aria-hidden="true">?</span>';
    $('settingsbtn').before(btn);

    book.register('shortcuts', {
      title: 'Keyboard shortcuts', sub: 'Every key in the town. Press ? any time to open or close this page.', c: '#8FB8D6', icon: PAGE_ICONS.shortcuts,
      render: shortcutsHtml,
      click(e) {
        if (!e.target.closest('[data-act="tips"]')) return;
        dispatchEvent(new Event('nexus:tips-reset'));
        toast('The tips are back. They show up as you play.');
      },
    });
    btn.onclick = () => book.toggle('shortcuts');

    return {
      onKey(e) {
        if (e.key === '?') { book.toggle('shortcuts'); return true; }
        return false;
      },
    };
  },
};
