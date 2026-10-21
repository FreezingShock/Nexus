// Services, parks and landmarks. Their coverage makes the tiles around them happier; happy built tiles earn a little
// more, landmarks earn a flat amount, and every service and park pays a small upkeep. Nothing here can fail or shut a
// building down. Rules live in src/sim/services.js and the numbers in src/sim/services-config.js.
// Owns no saved state: the map is rebuilt from state.placed when the placed list changes, so a save stays the same size.
import { GRID_N } from '../../world/grid.js';
import { MOOD } from '../services-config.js';
import { growthOf, happinessMap, sourceOf } from '../services.js';

const AREA = GRID_N * GRID_N;
const caches = new WeakMap(); // sim -> derived numbers, rebuilt by refresh()

export default {
  id: 'services',

  // Teaches the sim its API. Runs after placement's init (alphabetical order), so state.placed is already clean.
  init(ctx) {
    const { sim } = ctx;
    caches.set(sim, { sig: null, sources: [], happy: new Float32Array(AREA), built: 0, avg: MOOD.base, moodCoins: 0, landmarkCoins: 0, upkeep: 0 });
    refresh(ctx);
    sim.services = {
      sources: () => caches.get(sim).sources.slice(),
      happiness: () => caches.get(sim).happy,
      happinessAt: (gx, gz) => caches.get(sim).happy[gz * GRID_N + gx],
      // Average happiness over built tiles, 0..1. The base when nothing is built yet.
      average: () => caches.get(sim).avg,
      // Zoning growth multiplier (1 when nothing is built). Read by zoning's tick and offline catch-up.
      growth: () => growthOf(caches.get(sim).avg, caches.get(sim).built),
      summary: () => {
        const c = caches.get(sim);
        return {
          services: c.sources.filter((s) => s.kind === 'service').length,
          parks: c.sources.filter((s) => s.kind === 'park').length,
          landmarks: c.sources.filter((s) => s.kind === 'landmark').length,
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

// Rebuilds sources and the happiness map when the placed list changes, then the numbers that depend on the grid.
function refresh({ sim, state, grid }) {
  const c = caches.get(sim);
  const sig = state.placed.map((r) => r.id).join(',');
  if (sig !== c.sig) {
    c.sig = sig;
    c.sources = state.placed.map(sourceOf).filter(Boolean);
    c.happy = happinessMap(c.sources);
  }
  let built = 0, sum = 0;
  for (let i = 0; i < AREA; i++) if (grid.lot[i] !== 0) { built++; sum += c.happy[i]; }
  c.built = built;
  c.avg = built ? sum / built : MOOD.base;
  c.moodCoins = MOOD.perTile * sum;
  c.landmarkCoins = c.sources.reduce((a, s) => a + s.coins, 0);
  c.upkeep = c.sources.reduce((a, s) => a + s.upkeep, 0);
  return c;
}
