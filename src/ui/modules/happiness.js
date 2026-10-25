// The Happiness plaque in the top bar: a face and a mood word, never a percentage. Hover shows how the town feels in a
// line; clicking it opens a panel with how many homes are well served, what homes can reach on foot, and a few cozy
// tips. Each tip has a Show button that moves the camera to its spot and sends a ripple there. Closes with a click on
// the plaque, Esc, a right-click, or a click anywhere else. Reads the sim; changes no state.
import { $ } from '../format.js';
import { topRight } from '../slot.js';
import { GRID_HALF, TILE } from '../../world/grid.js';
import { faceSvg, hoverHtml, moodStep, panelHtml, pipsHtml } from '../happiness-view.js';

const calmer = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default {
  id: 'happiness',
  create({ sim, scene }) {
    const overlay = () => scene.sys('services-overlay');
    // The plaque, its hover card and the panel live in the top bar (index.html); this module fills them.
    const chip = $('hpchip'), panel = $('hp-panel'), pop = $('hppop'), wrap = $('hpwrap');
    const mood = $('hpmood'), pips = $('hppips'), face = $('hpface');
    if (!chip || !panel) return {};
    let open = false, shown = '';

    // The panel's content (src/ui/happiness-view.js), drawn only when the advice changes (checked a few times a second).
    let tips = [];
    function render(adv) {
      const key = JSON.stringify(adv);
      if (key === shown) return;
      shown = key; tips = adv.tips;
      panel.innerHTML = panelHtml(adv);
    }
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tip]');
      if (b && tips[b.dataset.tip]) showSpot(tips[b.dataset.tip]);
    });

    // Moves the camera to a tip's spot and sends a ripple there. The camera glides; with reduced motion it still moves, only the ripple is skipped.
    function showSpot(t) {
      const x = (t.gx - GRID_HALF) * TILE, z = (t.gz - GRID_HALF) * TILE;
      scene.focus(x, z);
      if (!calmer()) overlay().ripple(t.gx, t.gz, 2);
    }

    // The hover card: the mood in a line, drawn while the pointer or focus is on the plaque.
    let hover = false, shownPop = '';
    function paintPop() {
      const html = hoverHtml(sim.services.advice());
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

    // The plaque: a face and a mood word, and four pips for the step on the mood ladder. Never a percentage.
    let lastStep = -1;
    const sync = () => {
      const adv = sim.services.advice(), step = adv.built ? moodStep(adv.level.label) : 0;
      const word = adv.built ? adv.level.label : 'Waiting for homes';
      if (mood.textContent !== word) mood.textContent = word;
      if (step !== lastStep) { lastStep = step; pips.innerHTML = pipsHtml(step); face.innerHTML = faceSvg(step); chip.dataset.step = String(step); }
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
