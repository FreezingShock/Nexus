// The Population counter: a big chip in the bottom left (key U) where a "+1" and a little person fly off as folk move
// in. Hover shows a short card; a click opens a paper panel with a graph of recent growth, the room the homes allow, and a
// few plain facts. Reads sim.population and state.popHist; sends no commands.
import { summaryOf } from '../../sim/population.js';
import { fmtExact } from '../format.js';
import { MOOD } from '../../sim/services-config.js';
import { renderSettings } from '../../core/quality.js';

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
  // soft ruled lines, like the notebook paper, at a quarter, half and three quarters of the height
  let grid = '';
  for (const f of [0.25, 0.5, 0.75]) { const y = (H - 8 - f * (H - 18)).toFixed(1); grid += `<line x1="6" x2="${W - 6}" y1="${y}" y2="${y}" stroke="#C9B48E" stroke-width="1" stroke-dasharray="2 4"/>`; }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="People over the last 10 minutes, against the room the homes allow">${grid}` +
    `<path d="${cap}" fill="none" stroke="#97553E" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>` +
    `<polygon points="${x0},${H - 8} ${line} ${x1},${H - 8}" fill="#BFD8C4" opacity=".8"/>` +
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

// The facts under the graph, as small tiles: a coloured dot, the value big, and what it means under it.
function factTiles(sum) {
  const tile = (c, v, k) => `<li style="--c:${c}"><b>${v}</b><span>${k}</span></li>`;
  return `<ul class="pp-facts">` +
    tile('#BFD8C4', Math.round(sum.fill * 100) + '%', 'of homes lived in') +
    tile('#F2D27A', fmtExact(Math.ceil(sum.vacancy)), 'free places') +
    tile('#E3A08E', sum.perMin >= 0.5 ? sum.perMin.toFixed(1) : sum.vacancy > 0.5 ? 'a trickle' : '—', sum.perMin >= 0.5 ? 'moving in a minute' : sum.vacancy > 0.5 ? 'moving in' : 'homes are full') +
    tile('#9CC3D5', sum.vacancy > 0.5 ? clock(sum.toFullS) : 'Full', sum.vacancy > 0.5 ? 'until the homes are full' : 'every place is taken') +
    `</ul>`;
}

export function panelHtml(sum, hist, happy, hover = null) {
  const helping = happy >= 0.6 ? 'A happy town: newcomers arrive quicker.' : happy <= MOOD.base + 0.05 ? 'Services, parks and shops near homes would bring people in faster.' : 'Steady. More services and parks near homes speed it up.';
  return `<div class="pp-top"><p class="pp-big"><b>${fmtExact(Math.floor(sum.people))}</b> <span>of ${fmtExact(sum.capacity)} places</span></p>` +
    `<span class="pp-pace">${sum.pace}${sum.relSpeed >= 0.05 ? ' · ' + sum.relSpeed.toFixed(2) + '×' : ''}</span></div>` +
    `<div class="pp-graph" data-graph>${graphSvg(hist, hover)}${hover != null ? tipHtml(hist, hover) : ''}` +
    `<div class="pp-key"><span class="k-people">Residents</span><span class="k-room">Room in homes</span><span class="k-when">last 10 min</span></div></div>` +
    factTiles(sum) +
    `<p class="pp-note">${helping} Everyone arrives through the tunnel, and the more people, the more cars and walkers you see.</p>`;
}

// The short card on hover: the count, the room left and how fast people arrive.
export function hoverHtml(sum) {
  const rate = sum.perMin >= 0.5 ? sum.perMin.toFixed(1) + ' moving in a minute' : sum.vacancy > 0.5 ? 'A trickle moving in' : 'Every home is full';
  return `<b>${fmtExact(Math.floor(sum.people))} residents</b><span>${fmtExact(Math.ceil(sum.vacancy))} free places · ${rate}</span><em>Click for the graph · U</em>`;
}

// What the counter shows flying off it when the count changes: the whole-number change between two readings, or 0 for
// no change and for a jump (offline catch-up, import, Start over), which would only be noise.
export const FLY_MAX = 40;
export function popDelta(prev, now) {
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev < 0 || now < 0) return 0;
  const d = Math.floor(now) - Math.floor(prev);
  return Math.abs(d) > FLY_MAX ? 0 : d;
}
export const flyLabel = (d) => (d > 0 ? '+' + d : d < 0 ? '−' + -d : '');
// Little people hop off with the number: one per newcomer, at most three so a rush stays calm. None when people leave.
export const hoppers = (d) => (d > 0 ? Math.min(3, d) : 0);
export const FLY_GAP_S = 0.7; // a new number flies at most this often; arrivals in between join the next one

const PERSON = '<svg viewBox="0 0 14 18" aria-hidden="true"><circle cx="7" cy="4.4" r="3.2" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.6"/><path d="M1.6 17c0-4 2.4-6.6 5.4-6.6s5.4 2.6 5.4 6.6Z" fill="#E3A08E" stroke="#2B2620" stroke-width="1.6" stroke-linejoin="round"/></svg>';
import { calmer } from '../../core/access.js';

export default {
  id: 'population',
  create({ sim, quality }) {
    const pp = sim.population;
    const host = document.getElementById('leftcol');
    if (!pp || !host) return {};
    const fx = () => (quality ? renderSettings(quality.get()).effects : 1);
    const chip = el('button', 'card pop-chip',
      `<span class="pc-badge">${ICON}</span><span class="pc-txt"><b class="pc-n">—</b><small class="pc-sub">residents <i class="pc-rate"></i></small></span>` +
      `<span class="pc-flies" aria-hidden="true"></span><span class="pop card pc-pop" role="tooltip" id="poppop"></span>`);
    chip.id = 'popchip'; chip.type = 'button';
    chip.setAttribute('aria-expanded', 'false'); chip.setAttribute('aria-controls', 'poppanel');
    chip.setAttribute('aria-label', 'Population'); chip.setAttribute('aria-describedby', 'poppop');
    const panel = el('aside', 'card pop-panel');
    panel.id = 'poppanel'; panel.setAttribute('data-mo', 'up'); panel.hidden = true;
    const head = el('div', 'pp-head', `<span class="pp-stamp">${ICON}</span><div><h2 class="h-disp">Population</h2><small>Who lives in town, and how fast it grows</small></div>`);
    const body = el('div', 'pp-body');
    panel.append(head, body);
    host.after(chip, panel);
    const num = chip.querySelector('.pc-n'), rate = chip.querySelector('.pc-rate'), flies = chip.querySelector('.pc-flies'), pop = chip.querySelector('.pc-pop');
    let open = false, shown = '', shownPop = '', acc = 1, hover = null;
    let last = null, pending = 0, flyAt = -9;

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

    // The number that flies off the counter, and a few little people hopping away with it when folk move in.
    function fly(d) {
      if (calmer() || fx() === 0) return;
      const n = el('span', 'pc-fly ' + (d > 0 ? 'up' : 'down'), flyLabel(d));
      flies.append(n); setTimeout(() => n.remove(), 1300);
      const k = fx() >= 1 ? hoppers(d) : Math.min(1, hoppers(d));
      for (let i = 0; i < k; i++) {
        const h = el('span', 'pc-hop', PERSON);
        h.style.setProperty('--dx', (14 + i * 16 + Math.random() * 8).toFixed(0) + 'px');
        h.style.animationDelay = (i * 90) + 'ms';
        flies.append(h); setTimeout(() => h.remove(), 1200 + i * 90);
      }
      num.classList.remove('fx-bump'); void num.offsetWidth; num.classList.add('fx-bump');
    }

    function paint() {
      const happy = sim.services ? sim.services.average() : MOOD.base;
      const sum = summaryOf(pp.people(), pp.capacity(), happy);
      const now = performance.now() / 1000;
      if (last !== null) pending += popDelta(last, sum.people);
      last = sum.people;
      if (pending && now - flyAt >= FLY_GAP_S) { fly(pending); pending = 0; flyAt = now; }
      num.textContent = fmtExact(Math.floor(sum.people));
      rate.textContent = sum.perMin >= 0.5 ? '+' + sum.perMin.toFixed(1) + '/min' : '';
      const ph = hoverHtml(sum);
      if (ph !== shownPop) { shownPop = ph; pop.innerHTML = ph; }
      if (!open) return;
      const html = panelHtml(sum, sim.state.popHist, happy, hover);
      if (html !== shown) { shown = html; body.innerHTML = html; }
    }
    paint();
    return {
      frame(dt) { acc += dt; if (acc >= 0.25) { acc = 0; paint(); } },
      onKey(e) { if (e.key === 'u' || e.key === 'U') { set(!open); return true; } return false; },
    };
  },
};
