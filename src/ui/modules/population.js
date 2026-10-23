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

// The graph covers 10 minutes: samples are 15 sim seconds apart, so 40 gaps. The hover points are 2 minutes apart.
export const SPAN = 40, STEP = 8;

// The hover points, oldest first: { i: samples ago, minAgo, people, cap, perMin }. perMin is the move-in rate over the 2 minutes before.
export function steps(hist) {
  const out = [];
  for (let k = 0; ; k++) {
    const j = hist.length - 1 - k * STEP;
    if (j < 0 || k * STEP > SPAN) break;
    const prev = hist[j - STEP];
    out.unshift({ i: k * STEP, minAgo: k * 2, people: hist[j][0], cap: hist[j][1], perMin: prev ? Math.max(0, (hist[j][0] - prev[0]) / 2) : null });
  }
  return out;
}

const W = 288, H = 110;
const xOf = (ago) => 6 + (1 - ago / SPAN) * (W - 12);

// The graph as inline SVG: people (solid, filled) under the capacity line (dashed), time running right to "now".
// `hover` is an index into steps(hist), or null.
export function graphSvg(hist, hover = null) {
  const pts = hist.slice(-(SPAN + 1)).map((v, i, a) => ({ ago: a.length - 1 - i, p: v[0], c: v[1] }));
  if (!pts.length) pts.push({ ago: 0, p: 0, c: 0 });
  const top = Math.max(1, ...pts.map((q) => Math.max(q.p, q.c))) * 1.08;
  const Y = (v) => H - 8 - (v / top) * (H - 18);
  const line = pts.map((q) => `${xOf(q.ago).toFixed(1)},${Y(q.p).toFixed(1)}`).join(' ');
  const cap = pts.map((q, i) => `${i ? 'L' : 'M'}${xOf(q.ago).toFixed(1)},${Y(q.c).toFixed(1)}`).join('');
  const x0 = xOf(pts[0].ago).toFixed(1), x1 = xOf(0).toFixed(1);
  let mark = '';
  const st = steps(hist);
  for (const s of st) mark += `<circle cx="${xOf(s.i).toFixed(1)}" cy="${Y(s.people).toFixed(1)}" r="3" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.6"/>`;
  if (hover != null && st[hover]) {
    const s = st[hover], x = xOf(s.i).toFixed(1);
    mark = `<line x1="${x}" x2="${x}" y1="4" y2="${H - 8}" stroke="#2B2620" stroke-width="1.5" stroke-dasharray="3 3" opacity=".55"/>` + mark +
      `<circle cx="${x}" cy="${Y(s.people).toFixed(1)}" r="5" fill="#B8472E" stroke="#2B2620" stroke-width="2"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="People over the last 10 minutes, against the room the homes allow">` +
    `<path d="${cap}" fill="none" stroke="#97553E" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>` +
    `<polygon points="${x0},${H - 8} ${line} ${x1},${H - 8}" fill="#BFD8C4" opacity=".75"/>` +
    `<polyline points="${line}" fill="none" stroke="#2B2620" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${mark}</svg>`;
}

// The card that follows the hovered point: what the town held 2, 4, ... minutes ago.
function tipHtml(hist, hover) {
  const s = steps(hist)[hover];
  if (!s) return '';
  const when = s.minAgo === 0 ? 'Now' : s.minAgo + ' min ago';
  const rate = s.perMin == null ? '' : `<span>Moving in ${s.perMin >= 0.5 ? s.perMin.toFixed(1) + ' a min' : 'a trickle'}</span>`;
  const left = Math.min(78, Math.max(22, (xOf(s.i) / W) * 100));
  return `<div class="pp-tip" style="left:${left.toFixed(1)}%"><b>${when}</b><span>${fmtExact(Math.floor(s.people))} people</span><span>${fmtExact(Math.round(s.cap))} places</span>${rate}</div>`;
}

export function panelHtml(sum, hist, happy, hover = null) {
  const row = (k, v) => `<div class="pr"><dt>${k}</dt><dd>${v}</dd></div>`;
  const helping = happy >= 0.6 ? 'A happy town: newcomers arrive quicker.' : happy <= MOOD.base + 0.05 ? 'Services, parks and shops nearby would bring people in faster.' : 'Steady. More services and parks speed it up.';
  return `<p class="pp-big"><b>${fmtExact(Math.floor(sum.people))}</b> <span>of ${fmtExact(sum.capacity)} places</span></p>` +
    `<div class="pp-graph" data-graph>${graphSvg(hist, hover)}${hover != null ? tipHtml(hist, hover) : ''}<small>Last 10 minutes · hover for each 2 minutes · dashed line is the room the homes allow</small></div>` +
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
    let open = false, shown = '', acc = 1, hover = null;

    const set = (on) => {
      open = on; panel.hidden = !on;
      chip.setAttribute('aria-expanded', String(on));
      chip.classList.toggle('open', on);
      hover = null;
      if (on) { shown = ''; acc = 1; }
    };
    chip.addEventListener('click', () => set(!open));
    // Hover: the nearest 2-minute point to the pointer. The body is redrawn as numbers change, so the choice lives here.
    const pick = (e) => {
      const svg = body.querySelector('[data-graph] svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const ago = (1 - ((e.clientX - r.left) / r.width * W - 6) / (W - 12)) * SPAN;
      const st = steps(sim.state.popHist);
      let best = null, d = 1e9;
      st.forEach((q, k) => { const dd = Math.abs(q.i - ago); if (dd < d) { d = dd; best = k; } });
      if (best !== hover) { hover = best; paint(); }
    };
    body.addEventListener('pointermove', (e) => { if (e.target.closest && e.target.closest('[data-graph]')) pick(e); else if (hover != null) { hover = null; paint(); } });
    body.addEventListener('pointerleave', () => { if (hover != null) { hover = null; paint(); } });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') set(false); });

    function paint() {
      const happy = sim.services ? sim.services.average() : MOOD.base;
      const sum = summaryOf(pp.people(), pp.capacity(), happy);
      num.textContent = fmtExact(Math.floor(sum.people));
      if (!open) return;
      const html = panelHtml(sum, sim.state.popHist, happy, hover);
      if (html !== shown) { shown = html; body.innerHTML = html; }
    }
    paint();
    return {
      frame(dt) { acc += dt; if (acc >= 0.5) { acc = 0; paint(); } },
      onKey(e) { if (e.key === 'u' || e.key === 'U') { set(!open); return true; } return false; },
    };
  },
};
