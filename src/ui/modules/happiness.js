// The Happiness plaque in the top bar. Hover shows how the city feels in a line; clicking it opens a digestible summary,
// what helps, what pulls the streets down, and a few cozy tips. Each tip has a Show button that moves the camera to its
// spot and sends a ripple there. Closes with a click on the plaque, Esc, a right-click, or a click anywhere else. Reads the sim; changes no state.
import { $ } from '../format.js';
import { topRight } from '../slot.js';
import { GRID_HALF, TILE } from '../../world/grid.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const calmer = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default {
  id: 'happiness',
  create({ sim, scene }) {
    const overlay = () => scene.sys('services-overlay');
    // The plaque, its hover card and the panel live in the top bar (index.html); this module fills them.
    const chip = $('hpchip'), panel = $('hp-panel'), pop = $('hppop'), wrap = $('hpwrap');
    const pct = $('hppct'), fill = $('hpbar');
    if (!chip || !panel) return {};
    let open = false, shown = '';

    // The panel's content, drawn only when the advice changes (checked a few times a second).
    function render(adv) {
      const key = JSON.stringify(adv);
      if (key === shown) return;
      shown = key;
      panel.replaceChildren();
      panel.append(el('p', 'hp-level', adv.level.label), el('p', 'hp-summary', adv.summary));
      section('Helping', adv.helping.length ? adv.helping : [{ text: 'Nothing yet. A clinic, a park or a shop lifts the homes around it.' }]);
      section('Pulling down', adv.hurting.length ? adv.hurting : [{ text: adv.built ? 'Nothing is pulling the streets down.' : 'No homes yet.' }]);
      const tips = el('section', 'hp-section');
      tips.append(el('h4', null, 'Recommendations'));
      if (!adv.tips.length) {
        tips.append(el('p', 'hp-quiet', adv.built ? 'Every home is nicely covered. Enjoy the quiet.' : 'Tips appear once there are homes to look after.'));
      } else {
        const list = el('ol', 'hp-tips');
        for (const t of adv.tips) {
          const li = el('li');
          const show = el('button', 'hp-show', 'Show');
          show.type = 'button';
          show.setAttribute('aria-label', 'Show ' + t.text);
          show.addEventListener('click', () => showSpot(t));
          li.append(el('span', null, t.text), show);
          list.append(li);
        }
        tips.append(list);
      }
      panel.append(tips);
    }
    function section(title, items) {
      const s = el('section', 'hp-section');
      s.append(el('h4', null, title));
      const ul = el('ul', 'hp-list');
      for (const it of items) ul.append(el('li', null, it.text));
      s.append(ul);
      panel.append(s);
    }

    // Moves the camera to a tip's spot and sends a ripple there. The camera glides; with reduced motion it still moves, only the ripple is skipped.
    function showSpot(t) {
      const x = (t.gx - GRID_HALF) * TILE, z = (t.gz - GRID_HALF) * TILE;
      scene.focus(x, z);
      if (!calmer()) overlay().ripple(t.gx, t.gz, 2);
    }

    // The hover card: the mood in a line, drawn while the pointer or focus is on the plaque.
    let hover = false, shownPop = '';
    function paintPop() {
      const adv = sim.services.advice();
      const html = adv.built
        ? `<h3>${adv.level.label}</h3><p class="pc-lead">${adv.summary}</p><p class="pc-note">Click for what helps and what to try.</p>`
        : '<h3>Happiness</h3><p class="pc-lead">It appears once there are homes. Shops, parks and clinics lift the homes around them.</p>';
      if (html !== shownPop) { shownPop = html; pop.innerHTML = html; }
    }
    for (const t of ['pointerenter', 'focus']) chip.addEventListener(t, () => { hover = true; paintPop(); });
    for (const t of ['pointerleave', 'blur']) chip.addEventListener(t, () => { hover = false; });

    // Keep the panel inside the window: shift it sideways when it would run off the right edge.
    function clampPanel() {
      panel.style.marginLeft = '';
      const r = panel.getBoundingClientRect(), m = 8;
      const shift = r.right > innerWidth - m ? innerWidth - m - r.right : 0;
      if (shift) panel.style.marginLeft = shift + 'px';
    }
    function setOpen(on) {
      if (on) topRight.claim('happiness');
      open = on;
      chip.setAttribute('aria-expanded', String(on));
      panel.hidden = !on;
      chip.classList.toggle('open', on);
      if (on) { render(sim.services.advice()); clampPanel(); }
    }
    topRight.register('happiness', { isOpen: () => open, close: () => setOpen(false), el: panel });
    chip.addEventListener('click', () => setOpen(!open));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
    });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); chip.focus(); } });
    document.addEventListener('contextmenu', () => { if (open) setOpen(false); });
    // A click anywhere else closes it, so it never sits over the town.
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });

    const sync = () => {
      const s = sim.services.summary(), p = Math.round(s.average * 100);
      pct.textContent = s.built ? p + '%' : '—';
      fill.style.width = s.built ? Math.max(4, p) + '%' : '0%';
    };
    sync();
    let acc = 0;

    return {
      frame(dt) {
        acc += dt;
        if (acc < 0.25) return;
        acc = 0;
        sync();
        if (open) render(sim.services.advice());
        if (hover) paintPop();
      },
    };
  },
};
