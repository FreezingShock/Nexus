// The Population panel: a small chip in the bottom left (key U) that opens a paper card with a graph of recent growth,
// the capacity the homes allow, and a few plain facts. Reads sim.population and state.popHist; sends no commands.
import { summaryOf } from '../../sim/population.js';
import { fmtExact } from '../format.js';
import { MOOD } from '../../sim/services-config.js';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="#FBF6EA"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9.5" r="2.5" fill="#FBF6EA"/><path d="M16.5 14.2c2.6 0 4.5 1.9 4.5 4.8"/></svg>';

const clock = (s) => (s < 90 ? 'under a minute' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h');

// The graph as inline SVG: people (solid, filled) under the capacity line (dashed). Samples are 15 sim seconds apart.
export function graphSvg(hist, w = 288, h = 110) {
  const pts = hist.length > 1 ? hist : [[0, 0], ...hist, ...hist];
  const top = Math.max(1, ...pts.map((p) => p[1]), ...pts.map((p) => p[0])) * 1.08;
  const X = (i) => 6 + (i / (pts.length - 1)) * (w - 12), Y = (v) => h - 8 - (v / top) * (h - 18);
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p[0]).toFixed(1)}`).join(' ');
  const cap = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="People over the last half hour, against the room the homes allow">` +
    `<path d="${cap}" fill="none" stroke="#97553E" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>` +
    `<polygon points="${X(0).toFixed(1)},${h - 8} ${line} ${X(pts.length - 1).toFixed(1)},${h - 8}" fill="#BFD8C4" opacity=".75"/>` +
    `<polyline points="${line}" fill="none" stroke="#2B2620" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function panelHtml(sum, hist, happy) {
  const row = (k, v) => `<div class="pr"><dt>${k}</dt><dd>${v}</dd></div>`;
  const helping = happy >= 0.6 ? 'A happy town: newcomers arrive quicker.' : happy <= MOOD.base + 0.05 ? 'Services, parks and shops nearby would bring people in faster.' : 'Steady. More services and parks speed it up.';
  return `<p class="pp-big"><b>${fmtExact(Math.floor(sum.people))}</b> <span>of ${fmtExact(sum.capacity)} places</span></p>` +
    `<div class="pp-graph">${graphSvg(hist)}<small>Last 30 minutes · dashed line is the room the homes allow</small></div>` +
    `<dl class="pr-list">` +
    row('Homes lived in', Math.round(sum.fill * 100) + '%') +
    row('Free places', fmtExact(Math.ceil(sum.vacancy))) +
    row('Moving in', sum.perMin >= 0.5 ? sum.perMin.toFixed(1) + ' a minute' : sum.vacancy > 0.5 ? 'a trickle' : 'homes are full') +
    row('Pace', sum.pace + (sum.relSpeed >= 0.05 ? ' · ' + sum.relSpeed.toFixed(2) + '×' : '')) +
    row('Full in', sum.vacancy > 0.5 ? 'about ' + clock(sum.toFullS) : '—') +
    `</dl><p class="pp-note">${helping} Everyone arrives through the tunnel; the more people, the more cars and walkers you see.</p>`;
}

export default {
  id: 'population',
  create({ sim }) {
    const pp = sim.population;
    const host = document.getElementById('leftcol');
    if (!pp || !host) return {};
    const chip = el('button', 'card pop-chip', ICON + '<span class="pc-n">—</span>');
    chip.id = 'popchip'; chip.type = 'button';
    chip.setAttribute('aria-expanded', 'false'); chip.setAttribute('aria-controls', 'poppanel');
    chip.setAttribute('aria-label', 'Population');
    const panel = el('aside', 'card pop-panel');
    panel.id = 'poppanel'; panel.setAttribute('data-mo', 'up'); panel.hidden = true;
    const head = el('div', 'pp-head', '<h2 class="h-disp">Population</h2>');
    const body = el('div', 'pp-body');
    panel.append(head, body);
    host.after(chip, panel);
    const num = chip.querySelector('.pc-n');
    let open = false, shown = '', acc = 1;

    const set = (on) => {
      open = on; panel.hidden = !on;
      chip.setAttribute('aria-expanded', String(on));
      chip.classList.toggle('open', on);
      if (on) { shown = ''; acc = 1; }
    };
    chip.addEventListener('click', () => set(!open));
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') set(false); });

    function paint() {
      const happy = sim.services ? sim.services.average() : MOOD.base;
      const sum = summaryOf(pp.people(), pp.capacity(), happy);
      num.textContent = fmtExact(Math.floor(sum.people));
      if (!open) return;
      const html = panelHtml(sum, sim.state.popHist, happy);
      if (html !== shown) { shown = html; body.innerHTML = html; }
    }
    paint();
    return {
      frame(dt) { acc += dt; if (acc >= 0.5) { acc = 0; paint(); } },
      onKey(e) { if (e.key === 'u' || e.key === 'U') { set(!open); return true; } return false; },
    };
  },
};
