// The keyboard sheet: press ? (or the ? button) to see every binding. Built from src/ui/shortcuts.js, so it lists the real keys.
import { $ } from '../format.js';
import { SHORTCUT_GROUPS } from '../shortcuts.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

function groupHtml(g) {
  const rows = g.rows.map((r) => `<li><span class="kcaps">${r.keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span><span>${r.text}</span></li>`).join('');
  return `<section class="kgroup"><h3>${g.title}</h3><ul>${rows}</ul></section>`;
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

    const card = document.createElement('aside');
    card.id = 'shortcuts';
    card.className = 'card shortcuts';
    card.hidden = true;
    card.setAttribute('aria-label', 'Keyboard shortcuts');
    card.innerHTML = `<button class="x" id="kx" aria-label="Close">${CLOSE_SVG}</button>
      <div class="band"><h2 class="h-disp">Keyboard shortcuts</h2><div class="sub">Press ? any time to close this</div></div>
      <div class="pad">${SHORTCUT_GROUPS.map(groupHtml).join('')}</div>
      <div class="pad foot"><button class="btn" id="kreset">Show the tips again</button></div>`;
    $('app').appendChild(card);

    const isOpen = () => !card.hidden;
    function toggle(on = !isOpen()) {
      card.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) $('kx').focus({ preventScroll: true }); else btn.focus({ preventScroll: true });
    }

    btn.onclick = () => toggle();
    $('kx').onclick = () => toggle(false);
    $('kreset').onclick = () => {
      dispatchEvent(new Event('nexus:tips-reset'));
      toast('The tips are back. They show up as you play.');
    };

    return {
      onKey(e) {
        if (e.key === '?') { toggle(); return true; }
        if (e.key === 'Escape' && isOpen()) { toggle(false); return true; }
        return false;
      },
    };
  },
};
