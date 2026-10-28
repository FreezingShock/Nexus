// Views: a map mode that tints the town to show one thing (traffic or demand) without taking a tool. The eye button in the top
// bar switches Traffic on and off, the Demand plaque switches Demand; the active view gets a legend card at the bottom right. V cycles the views, T toggles Traffic.
// The renderer reads ui.view() (roads tint for 'traffic', zone shading for 'demand'); this module only owns the choice.
import { $ } from '../format.js';

export const VIEWS = [
  { id: 'normal', name: 'Normal', sub: 'The town as it is', key: '' },
  { id: 'traffic', name: 'Traffic', sub: 'How full each road is', key: 'T' },
  { id: 'demand', name: 'Demand', sub: 'What the town wants zoned', key: '' },
];
const EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const PLACING = ['build', 'services', 'parks', 'decor']; // V turns the building while one of these is in hand
const chip = (c, n) => `<span class="lchip"><i style="background:${c}"></i>${n}</span>`;

// The commute line under the Traffic legend: efficiency and what jams cost zones right now.
export function commuteLine(m) {
  const pct = Math.round(m.eff * 100), cost = -m.penalty;
  return cost >= 0.05 ? `Commute ${pct}% · jams take ${cost.toFixed(1)} coins/s from zones` : `Commute ${pct}% · traffic flows freely`;
}

export function legendHtml(view, sim) {
  if (view === 'traffic') {
    return `<div class="rhead"><b class="ptitle">Traffic</b><span class="rhint">Roads are tinted by how full they are</span></div>` +
      `<div class="lanes">${chip('var(--tr-free)', 'Free')}${chip('var(--tr-busy)', 'Busy')}${chip('var(--tr-jam)', 'Jammed')}</div>` +
      `<p class="vw-note" id="vw-commute">${commuteLine(sim.traffic)}</p>`;
  }
  return ''; // Demand has no card of its own: the plaque's hover card already says it
}

export default {
  id: 'views',
  create({ sim, tool }) {
    // The eye in the top bar (before the menu button) is a plain switch: one click shows Traffic, another hides it.
    // Demand is the same kind of switch on the Demand plaque. The active view's legend card floats at the bottom right.
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ib'; btn.id = 'vw-chip';
    btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Traffic view'); btn.title = 'Traffic view (T)';
    btn.innerHTML = EYE;
    $('ctrlwrap').querySelector('.ctrl').insertBefore(btn, $('menubtn'));
    const legend = document.createElement('section');
    legend.id = 'vw-legend'; legend.className = 'vw-legend card'; legend.hidden = true; legend.setAttribute('aria-live', 'polite');
    $('app').appendChild(legend);
    const plaque = $('demandw');
    let view = 'normal', shown = '', acc = 0;

    function paintLegend() {
      if (view !== 'traffic') { legend.hidden = true; shown = ''; return; }
      const html = legendHtml(view, sim);
      if (html !== shown) { shown = html; legend.innerHTML = html; }
      legend.hidden = false;
    }
    function set(v) {
      view = VIEWS.some((x) => x.id === v) ? v : 'normal';
      btn.setAttribute('aria-pressed', String(view === 'traffic'));
      if (plaque) { plaque.classList.toggle('viewing', view === 'demand'); plaque.setAttribute('aria-pressed', String(view === 'demand')); }
      shown = ''; paintLegend();
    }
    const flip = (v) => set(view === v ? 'normal' : v);
    btn.onclick = () => flip('traffic');
    if (plaque) {
      plaque.setAttribute('aria-pressed', 'false');
      plaque.onclick = () => flip('demand');
      plaque.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip('demand'); } });
    }
    set('normal');

    return {
      view: () => view,
      setView: set,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 't') { set(view === 'traffic' ? 'normal' : 'traffic'); return true; }
        if (k === 'v' && !PLACING.includes(tool())) { set(VIEWS[(VIEWS.findIndex((x) => x.id === view) + 1) % VIEWS.length].id); return true; }
        return false;
      },
      frame(dt) {
        if (view !== 'traffic') return;
        acc += dt;
        if (acc < 0.5) return;
        acc = 0; paintLegend();
      },
    };
  },
};
