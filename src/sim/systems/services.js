// Services, parks, landmarks, shops and industry. Coverage makes the homes around services, parks and shops happier,
// and industry eases them a little. Happy built tiles earn a little more, landmarks earn a flat amount, and every service
// and park pays a small upkeep. Nothing here can fail or shut a building down. Rules live in src/sim/services.js and the
// numbers in src/sim/services-config.js.
// Owns no saved state: the map is rebuilt when the placed list or the zoning changes, so a save stays the same size.
import { GRID_N, tileIndex } from '../../world/grid.js';
import { modelById } from '../../world/models.js';
import { lotTiles } from '../../world/placement.js';
import { MOOD } from '../services-config.js';
import { adviceFrom } from '../happiness-advice.js';
import { coverMaps, gainsOf, growthOf, happinessMap, lotSource, sourceOf } from '../services.js';

const AREA = GRID_N * GRID_N;
const caches = new WeakMap(); // sim -> derived numbers, rebuilt by refresh()
// Placing one of these lifts homes, so the happiness gain of its homes is worth showing as a little animation.
const GAIN_KINDS = new Set(['service', 'park', 'shop']);

export default {
  id: 'services',

  // Teaches the sim its API. Runs after placement's init (alphabetical order), so state.placed is already clean.
  init(ctx) {
    const { sim } = ctx;
    caches.set(sim, {
      sig: null, ids: new Set(), placed: [], zoned: [], all: [], happy: new Float32Array(AREA),
      gains: null, gainsId: null, gainsSource: null,
      live: null, advice: null, adviceSig: null,
      built: 0, avg: MOOD.base, moodCoins: 0, landmarkCoins: 0, upkeep: 0,
    });
    refresh(ctx);
    sim.services = {
      // Placed buildings only: the list the inspect and coverage UI counts.
      sources: () => caches.get(sim).placed.slice(),
      // Every source that shapes happiness, placed or grown on zoned ground. The coverage overlay reads this.
      sourcesAll: () => caches.get(sim).all.slice(),
      happiness: () => caches.get(sim).happy,
      happinessAt: (gx, gz) => caches.get(sim).happy[gz * GRID_N + gx],
      // The homes a just-placed building lifted, for its animation: { source, gains: [[gx, gz, gain], ...] } or null.
      // Only set on the refresh that followed that placement; later changes clear it.
      gainsFor: (id) => {
        const c = caches.get(sim);
        return c.gainsId === id && c.gains ? { source: c.gainsSource, gains: c.gains } : null;
      },
      // The Happiness panel's words and tips. Built only when the placed list or zoning changed since the last call.
      advice: () => {
        const c = caches.get(sim);
        if (c.adviceSig !== c.sig || !c.advice) {
          const { state, grid } = c.live;
          const counts = { service: 0, park: 0, shop: 0, landmark: 0, industry: 0 };
          for (const s of c.all) counts[s.kind]++;
          c.advice = adviceFrom({ built: c.built, average: c.avg, homes: homesOf(state, grid), maps: coverMaps(c.all), counts });
          c.adviceSig = c.sig;
        }
        return c.advice;
      },
      // Average happiness over built tiles, 0..1. The base when nothing is built yet.
      average: () => caches.get(sim).avg,
      // Zoning growth multiplier (1 when nothing is built). Read by zoning's tick and offline catch-up.
      growth: () => growthOf(caches.get(sim).avg, caches.get(sim).built),
      summary: () => {
        const c = caches.get(sim);
        const count = (kind) => c.all.filter((s) => s.kind === kind).length;
        return {
          services: count('service'),
          parks: count('park'),
          landmarks: count('landmark'),
          shops: count('shop'),
          industry: count('industry'),
          average: c.avg, built: c.built,
          moodCoins: c.moodCoins, landmarkCoins: c.landmarkCoins, upkeep: c.upkeep,
        };
      },
    };
  },

  // Coins per second from this system: landmarks and happy streets, minus upkeep. Runs inside refresh(), not per tick.
  rate(ctx) {
    const c = refresh(ctx);
    return c.landmarkCoins + c.moodCoins - c.upkeep;
  },
};

// Rebuilds the sources and happiness map when the placed list or the zoning changes, then the numbers that depend on the grid.
function refresh({ sim, state, grid }) {
  const c = caches.get(sim);
  c.live = { state, grid };
  const sig = state.placed.map((r) => r.id).join(',') + '|' + state.zoneRev;
  if (sig !== c.sig) {
    c.sig = sig;
    const first = c.sig === null; // a load: nothing was just placed, so nothing to animate
    const prev = c.happy;
    const added = state.placed.filter((r) => !c.ids.has(r.id));
    c.ids = new Set(state.placed.map((r) => r.id));
    c.placed = state.placed.map(sourceOf).filter(Boolean);
    c.zoned = zonedSources(state, grid);
    c.all = c.placed.concat(c.zoned);
    c.happy = happinessMap(c.all);
    // A newly placed service, park or shop: remember which homes it lifted, so the UI can animate them.
    c.gains = null; c.gainsId = null; c.gainsSource = null;
    const newest = added.length ? sourceOf(added[added.length - 1]) : null;
    if (!first && newest && GAIN_KINDS.has(newest.kind)) {
      c.gains = gainsOf(prev, c.happy, homesOf(state, grid));
      c.gainsId = newest.id;
      c.gainsSource = newest;
    }
  }
  let built = 0, sum = 0;
  for (let i = 0; i < AREA; i++) if (grid.lot[i] !== 0) { built++; sum += c.happy[i]; }
  c.built = built;
  c.avg = built ? sum / built : MOOD.base;
  c.moodCoins = MOOD.perTile * sum;
  c.landmarkCoins = c.placed.reduce((a, s) => a + s.coins, 0);
  c.upkeep = c.placed.reduce((a, s) => a + s.upkeep, 0);
  return c;
}

// Shops and industry grown on zoned ground, one source per lot.
function zonedSources(state, grid) {
  const out = [];
  for (const [i, level] of state.lots) {
    const s = lotSource(i, grid.zone[i], level);
    if (s) out.push(s);
  }
  return out;
}

// Grid indices of homes: grown Residential lots and placed homes. Used only when a placement needs its animation.
function homesOf(state, grid) {
  const m = new Uint8Array(AREA);
  for (let i = 0; i < AREA; i++) if (grid.zone[i] === 1 && grid.lot[i]) m[i] = 1;
  for (const r of state.placed) {
    const def = modelById(r.model);
    if (def && def.cat === 'home') {
      for (const [x, z] of lotTiles(r.gx, r.gz, r.fw, r.fd)) m[tileIndex(x, z)] = 1;
    }
  }
  return m;
}
