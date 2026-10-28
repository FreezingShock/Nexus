// Views: a map mode that tints the town to show one thing (traffic or demand) without taking a tool. A chip at the bottom
// right opens a short list; the active view gets a legend card above the chip. V cycles the views, T toggles Traffic.
// The renderer reads ui.view() (roads tint for 'traffic', zone shading for 'demand'); this module only owns the choice.
import { ZONE_DEFS } from '../../sim/zones.js';
import { demandWord } from '../hud-detail.js';
import { $ } from '../format.js';

export const VIEWS = [
  { id: 'normal', name: 'Normal', sub: 'The town as it is', key: '' },
  { id: 'traffic', name: 'Traffic', sub: 'How full each road is', key: 'T' },
  { id: 'demand', name: 'Demand', sub: 'What the town wants zoned', key: '' },
];
const EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
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
  const d = sim.zoning.demand();
  const rows = [1, 2, 3].map((z) => {
    const p = Math.round(d[z] * 100);
    return `<div class="vw-row${p >= 70 ? ' hot' : ''}"><span class="dk" style="background:${ZONE_DEFS[z].paint}">${ZONE_DEFS[z].name[0]}</span>` +
      `<span class="vw-name">${ZONE_DEFS[z].name}</span><span class="dbar" role="img" aria-label="${ZONE_DEFS[z].name} demand ${p}%"><i style="width:${p}%;background:${ZONE_DEFS[z].paint}"></i></span><em>${demandWord(p)}</em></div>`;
  }).join('');
  return `<div class="rhead"><b class="ptitle">Demand</b><span class="rhint">Zoned ground is shaded by type</span></div>${rows}` +
    `<p class="vw-note">Wanted types grow and level up sooner. It never stops growth, only slows it.</p>`;
}

export default {
  id: 'views',
  create({ sim, tool }) {
    const root = document.createElement('div');
    root.id = 'views'; root.className = 'views';
    root.innerHTML = `<section class="vw-legend card" id="vw-legend" hidden aria-live="polite"></section>` +
      `<div class="vw-menu card" id="vw-menu" role="menu" hidden>${VIEWS.map((v) => `<button type="button" role="menuitemradio" data-view="${v.id}"><b>${v.name}</b><small>${v.sub}</small>${v.key ? `<kbd>${v.key}</kbd>` : ''}</button>`).join('')}</div>` +
      `<button type="button" class="vw-chip card" id="vw-chip" aria-haspopup="true" aria-expanded="false" aria-label="Views" title="Views (V)">${EYE}<span>Views</span><kbd>V</kbd></button>`;
    $('app').appendChild(root);
    const legend = $('vw-legend'), menu = $('vw-menu'), btn = $('vw-chip');
    let view = 'normal', shown = '', acc = 0;

    const setMenu = (on) => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
    function paintLegend() {
      if (view === 'normal') { legend.hidden = true; shown = ''; return; }
      const html = legendHtml(view, sim);
      if (html !== shown) { shown = html; legend.innerHTML = html; }
      legend.hidden = false;
    }
    function set(v) {
      view = VIEWS.some((x) => x.id === v) ? v : 'normal';
      menu.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === view)));
      root.dataset.view = view;
      btn.classList.toggle('on', view !== 'normal');
      shown = ''; paintLegend(); setMenu(false);
    }
    btn.onclick = () => setMenu(menu.hidden);
    menu.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => set(b.dataset.view); });
    addEventListener('pointerdown', (e) => { if (!menu.hidden && !root.contains(e.target)) setMenu(false); }, true);
    set('normal');

    return {
      view: () => view,
      setView: set,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 't') { set(view === 'traffic' ? 'normal' : 'traffic'); return true; }
        if (k === 'v' && !PLACING.includes(tool())) { set(VIEWS[(VIEWS.findIndex((x) => x.id === view) + 1) % VIEWS.length].id); return true; }
        if (e.key === 'Escape') { if (!menu.hidden) { setMenu(false); return true; } }
        return false;
      },
      frame(dt) {
        if (view === 'normal') return;
        acc += dt;
        if (acc < 0.5) return;
        acc = 0; paintLegend();
      },
    };
  },
};
