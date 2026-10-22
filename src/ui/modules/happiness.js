// The Happiness panel: a compact bar in the left column. Clicking it opens a digestible summary of how the city feels,
// what helps, what pulls the streets down, and a few cozy tips. Each tip has a Show button that moves the camera to its
// spot and sends a ripple there. Closes with a click on the bar, Esc, or a right-click. Reads the sim; changes no state.
import { $ } from '../format.js';
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
    const card = el('div');
    card.id = 'happiness-card';
    card.className = 'card';
    const bar = el('button', 'hp-bar');
    bar.type = 'button';
    bar.setAttribute('aria-expanded', 'false');
    bar.setAttribute('aria-controls', 'hp-panel');
    const head = el('span', 'hp-head');
    head.append(el('span', 'hp-title', 'Happiness'), el('span', 'hp-pct', '—'));
    const meter = el('span', 'hp-meter');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', 'Average happiness');
    meter.append(el('i'));
    bar.append(head, meter);
    const panel = el('div', 'hp-panel');
    panel.id = 'hp-panel';
    panel.hidden = true;
    card.append(bar, panel);
    $('leftcol').appendChild(card);
    const pct = head.querySelector('.hp-pct'), fill = meter.querySelector('i');

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

    function setOpen(on) {
      open = on;
      bar.setAttribute('aria-expanded', String(on));
      panel.hidden = !on;
      card.classList.toggle('open', on);
      if (on) render(sim.services.advice());
    }
    bar.addEventListener('click', () => setOpen(!open));
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false); });
    document.addEventListener('contextmenu', () => { if (open) setOpen(false); });

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
      },
    };
  },
};
