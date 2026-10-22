// Population: homes have capacity, people move in slowly and faster when the town is happy. One saved number;
// each home's occupants are derived. Income is not affected (nate chose visuals only). Rules in src/sim/population.js, notes in docs/POPULATION.md.
import { modelById, describe } from '../../world/models.js';
import { advance, arrivalRate, capacityOfHome, capacityOfLot, occupantsOf, startPop } from '../population.js';
import { MOOD } from '../services-config.js';

export const HIST_MAX = 120; // samples kept
export const HIST_EVERY_S = 15; // one sample per 15 sim seconds, so the graph spans 30 minutes
const caches = new WeakMap(); // sim -> { sig, cap, homes }

const happyNow = (sim) => (sim.services ? sim.services.average() : MOOD.base);

function capacity(ctx) {
  const { sim, state, grid } = ctx;
  let c = caches.get(sim);
  const sig = state.placed.length + ':' + state.zoneRev + ':' + state.removed.length + ':' + state.lots.length;
  if (c && c.sig === sig) return c;
  const homes = [];
  let cap = 0;
  for (const r of state.placed) {
    const def = modelById(r.model);
    if (!def || def.cat !== 'home') continue;
    const d = describe(r);
    const n = capacityOfHome(d.floors);
    homes.push({ id: r.id, cap: n, gx: r.gx, gz: r.gz });
    cap += n;
  }
  for (const [i, level] of state.lots) {
    if (grid.zone[i] !== 1) continue;
    const n = capacityOfLot(level);
    homes.push({ id: 'lot' + i, cap: n, gx: i % 96, gz: Math.floor(i / 96) });
    cap += n;
  }
  c = { sig, cap, homes };
  caches.set(sim, c);
  return c;
}

function sample(ctx) {
  const h = ctx.state.popHist;
  h.push([Math.round(ctx.state.pop * 10) / 10, capacity(ctx).cap]);
  if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
}

export default {
  id: 'population',
  state: () => ({ pop: -1, popHist: [] }), // pop -1 = not set yet: init picks a starting share of capacity. popHist = recent [people, capacity] samples for the panel's graph
  sanitize(raw) {
    const p = raw.pop;
    const hist = Array.isArray(raw.popHist) ? raw.popHist.filter((h) => Array.isArray(h) && Number.isFinite(h[0]) && Number.isFinite(h[1]) && h[0] >= 0 && h[1] >= 0).slice(-HIST_MAX).map((h) => [Math.round(h[0] * 10) / 10, Math.round(h[1])]) : [];
    return { pop: Number.isFinite(p) && p >= 0 ? Math.min(p, 1e7) : -1, popHist: hist };
  },

  init(ctx) {
    const { sim, state } = ctx;
    caches.delete(sim);
    if (state.pop < 0) state.pop = startPop(capacity(ctx).cap);
    if (!state.popHist.length) state.popHist.push([Math.round(state.pop * 10) / 10, capacity(ctx).cap]);
    sim.population = {
      people: () => state.pop,
      capacity: () => capacity(ctx).cap,
      vacancy: () => Math.max(0, capacity(ctx).cap - state.pop),
      arrivals: () => arrivalRate(state.pop, capacity(ctx).cap, happyNow(sim)), // people per second
      homes: () => capacity(ctx).homes.length,
      occupantsOf: (id) => {
        const c = capacity(ctx), h = c.homes.find((x) => x.id === id);
        if (!h) return null;
        const local = sim.services ? sim.services.happinessAt(h.gx, h.gz) : MOOD.base;
        return { capacity: h.cap, occupants: occupantsOf(h.cap, state.pop, c.cap, local, happyNow(sim)) };
      },
    };
    // The render layer sees only state: hand it a read-only view that is not saved.
    Object.defineProperty(state, 'popLive', { configurable: true, enumerable: false, get: () => ({ cap: capacity(ctx).cap, perS: sim.population.arrivals() }) });
  },

  tick(ctx) {
    const { state } = ctx;
    state.pop = advance(state.pop, capacity(ctx).cap, happyNow(ctx.sim), 1);
    if (ctx.sim.ticks % HIST_EVERY_S === 0) sample(ctx);
  },

  // Closed form over the same window as income. The cap and happiness are the ones before the absence.
  offline(ctx, seconds) {
    const { state } = ctx;
    state.pop = advance(state.pop, capacity(ctx).cap, happyNow(ctx.sim), seconds);
    sample(ctx);
  },
};
