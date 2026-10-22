// Traffic: zone-to-zone trips on the road network, BPR congestion and the commute efficiency that trims zone income.
// Derived from roads and zoning, so nothing is saved. Work runs in small steps so a tick stays cheap. A cycle solves
// one flow field per destination zone, splits trips by gravity, assigns them, reads the times and commits.
// Cars read sim.traffic (flow fields and the spawn table). Congestion colours come from grid.load. See docs/TRAFFIC.md.
import * as T from '../traffic.js';
import { lotIncome } from '../zones.js';
import { carTripsPerPerson } from '../schedule.js';

const SOLVE_STEP = 4, MOVE_STEP = 8, WARM_CYCLES = 2;
// Car trips a resident makes a game minute, from their routines (schedule.js).
const PER_RESIDENT = carTripsPerPerson() / T.DAY_MIN;

function createModel() {
  const Z2 = T.ZONES * T.ZONES;
  return {
    net: null, roadsRef: null,
    anchors: new Int32Array(T.ZONES).fill(-1),
    isDest: new Uint8Array(T.ZONES),
    dests: [], fields: [], phase: 'idle', cursor: 0,
    demand: null,
    flow: new Float64Array(T.EDGES), aux: new Float64Array(T.EDGES),
    origin: new Float64Array(T.ZONES), attr: new Float64Array(T.ZONES),
    costTo: new Float64Array(Z2), work: new Float64Array(Z2), part: new Float64Array(Z2), total: new Float64Array(Z2),
    scratch: new Float64Array(T.TILES), tFree: new Float64Array(T.TILES), tCong: new Float64Array(T.TILES),
    num: 0, den: 0,
    // read by the render side and the UI
    eff: 1, penalty: 0, vehicles: 0,
    spawnEdge: new Int32Array(T.EDGES), spawnCum: new Float64Array(T.EDGES), spawnN: 0,
  };
}

// Starts a new cycle: rebuilds the network if the roads changed, reads demand and lists the destinations to solve.
function beginCycle({ state, grid }, m) {
  if (state.roads !== m.roadsRef) {
    m.roadsRef = state.roads;
    m.net = T.refreshCosts(T.buildNet(state.roads), m.flow);
    m.anchors = T.zoneAnchors(m.net.active);
  }
  const d = m.demand = T.zoneDemand(state, grid);
  m.dests = [];
  m.isDest.fill(0);
  for (let j = 0; j < T.ZONES; j++) {
    if (m.anchors[j] < 0 || !(d.jobs[j] > 0 || d.shops[j] > 0 || d.services[j] > 0 || d.pop[j] > 0)) continue;
    m.isDest[j] = 1; m.dests.push(j);
    if (!m.fields[j]) m.fields[j] = T.newField();
  }
  m.phase = 'solve'; m.cursor = 0;
}

// Solve: one Dijkstra per destination, and the travel time from every zone to it.
function solveStep(m, n, people) {
  for (let k = 0; k < n && m.cursor < m.dests.length; k++) {
    const j = m.dests[m.cursor++];
    T.solveField(m.net, m.anchors[j], m.fields[j]);
    const dist = T.lastDist();
    for (let i = 0; i < T.ZONES; i++) { const a = m.anchors[i]; m.costTo[j * T.ZONES + i] = a >= 0 ? dist[a] : Infinity; }
  }
  if (m.cursor >= m.dests.length) {
    splitTrips(m, people);
    m.phase = 'assign'; m.cursor = 0; m.aux.fill(0);
  }
}

// Gravity split per purpose: residents go to work (jobs), shops, services and other homes.
function splitTrips(m, people) {
  const d = m.demand;
  // trips follow the people actually living in town: zone homes only decide where they start, the total is the population
  let homes = 0;
  for (let i = 0; i < T.ZONES; i++) homes += d.pop[i];
  const live = homes > 0 ? Math.max(0, people) / homes : 0;
  const purposes = [[d.jobs, T.SHARE.work], [d.shops, T.SHARE.shop], [d.services, T.SHARE.service], [d.pop, T.SHARE.home]];
  m.total.fill(0);
  purposes.forEach(([attract, share], p) => {
    for (let i = 0; i < T.ZONES; i++) m.origin[i] = d.pop[i] * live * PER_RESIDENT * share;
    for (let j = 0; j < T.ZONES; j++) m.attr[j] = m.isDest[j] ? attract[j] : 0;
    const out = p === 0 ? m.work : m.part;
    out.fill(0);
    T.gravity(m.origin, m.attr, m.costTo, out);
    for (let k = 0; k < out.length; k++) m.total[k] += out[k];
  });
}

// Assign: each destination's trips go onto its tree. aux holds this cycle's volume per edge.
function assignStep(m, n) {
  for (let k = 0; k < n && m.cursor < m.dests.length; k++) {
    const j = m.dests[m.cursor++];
    const dem = m.scratch; dem.fill(0);
    let any = false;
    for (let i = 0; i < T.ZONES; i++) {
      const q = m.total[i * T.ZONES + j], a = m.anchors[i];
      if (q > 0 && a >= 0) { dem[a] += q; any = true; }
    }
    if (any) T.assignField(m.fields[j], dem, m.aux);
  }
  if (m.cursor >= m.dests.length) {
    // damped iteration: keep part of the last volumes so congestion settles instead of flipping every cycle
    for (let e = 0; e < T.EDGES; e++) m.flow[e] = T.DAMP * m.flow[e] + (1 - T.DAMP) * m.aux[e];
    T.refreshCosts(m.net, m.flow);
    m.phase = 'time'; m.cursor = 0; m.num = 0; m.den = 0;
  }
}

// Time: commute times on the final volumes, weighted by work trips.
function timeStep(ctx, m, n) {
  for (let k = 0; k < n && m.cursor < m.dests.length; k++) {
    const j = m.dests[m.cursor++];
    T.treeTimes(m.fields[j], m.net, m.tFree, m.tCong);
    for (let i = 0; i < T.ZONES; i++) {
      const w = m.work[i * T.ZONES + j], a = m.anchors[i];
      if (w > 0 && a >= 0 && Number.isFinite(m.costTo[j * T.ZONES + i])) { m.num += w * m.tCong[a]; m.den += w * m.tFree[a]; }
    }
  }
  if (m.cursor >= m.dests.length) finish(ctx, m);
}

// Commit: efficiency and the income penalty, road colours, and the table cars spawn from.
function finish({ state, grid, refresh }, m) {
  m.eff = T.commuteEfficiency(T.commuteRatio(m.num, m.den));
  const penalty = (m.eff - 1) * lotIncome(state.lots, (i) => grid.zone[i]);
  const changed = Math.abs(penalty - m.penalty) > 0.01;
  m.penalty = penalty;
  state.commutePenalty = penalty; state.commuteEff = m.eff;
  const net = m.net, load = grid.load;
  let vehicles = 0, cum = 0; m.spawnN = 0;
  for (let u = 0; u < T.TILES; u++) {
    if (!net.active[u]) { load[u] = T.CLASS.NONE; continue; }
    let vc = 0;
    for (let d = 0; d < 4; d++) {
      const e = u * 4 + d;
      if (!net.open[e]) continue;
      const f = m.flow[e];
      if (f > 0) { vc = Math.max(vc, f / net.cap[e]); vehicles += f; cum += f; m.spawnEdge[m.spawnN] = e; m.spawnCum[m.spawnN++] = cum; }
    }
    load[u] = vc > 0 ? T.congestionClass(vc) : T.CLASS.FREE;
  }
  m.vehicles = vehicles;
  grid.loadRev++;
  m.phase = 'idle';
  if (changed) refresh();
}

function stepPhase(ctx, m, n) {
  if (m.phase === 'solve') solveStep(m, n, ctx.state.pop);
  else if (m.phase === 'assign') assignStep(m, n);
  else if (m.phase === 'time') timeStep(ctx, m, n);
}

export default {
  id: 'traffic',
  order: 1, // after zoning's init, which fills grid.zone
  // The last committed commute penalty and efficiency are saved, so a reload pays exactly what the saved town paid.
  // Flows, colours and the spawn table are still derived and rebuilt on load.
  state: () => ({ commutePenalty: 0, commuteEff: 1 }),
  sanitize(raw) {
    const pen = Number.isFinite(raw.commutePenalty) ? Math.min(0, raw.commutePenalty) : 0;
    const eff = Number.isFinite(raw.commuteEff) ? Math.min(1, Math.max(T.MIN_EFF, raw.commuteEff)) : 1;
    return { commutePenalty: pen, commuteEff: eff };
  },
  rate: ({ sim }) => (sim.traffic ? sim.traffic.penalty : 0),
  init(ctx) {
    const m = createModel();
    ctx.sim.traffic = m; ctx.grid.traffic = m;
    ctx.grid.load = new Uint8Array(T.TILES); ctx.grid.loadRev = 0;
    const saved = { penalty: ctx.state.commutePenalty, eff: ctx.state.commuteEff };
    // a full warm-up at load, so the first frame already has cars and colours (never in a tick)
    for (let k = 0; k < WARM_CYCLES; k++) {
      beginCycle(ctx, m);
      while (m.phase !== 'idle') stepPhase(ctx, m, Infinity);
    }
    // the warm-up is not the saved history: restore the committed numbers so the income matches the save
    m.penalty = saved.penalty; m.eff = saved.eff;
    ctx.state.commutePenalty = saved.penalty; ctx.state.commuteEff = saved.eff;
  },
  tick(ctx) {
    const m = ctx.sim.traffic;
    if (m.phase === 'idle') beginCycle(ctx, m);
    stepPhase(ctx, m, m.phase === 'solve' ? SOLVE_STEP : MOVE_STEP);
  },
};
