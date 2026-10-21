// Services, parks, landmarks, shops and industry as plain rules: which records give coverage, how far, and what the tiles feel.
// Pure: no DOM, no THREE. The sim system (systems/services.js) keeps the results current; the UI reads them.
import { GRID_N } from '../world/grid.js';
import { SERVICES, PARKS, LANDMARKS, SHOPS, INDUSTRY, SHOP_LOT, INDUSTRY_LOT, LOT_LEVEL_SCALE, MOOD } from './services-config.js';

const AREA = GRID_N * GRID_N;

// The kind of a model for this system, or null when it gives no coverage.
export function kindOf(model) {
  if (SERVICES[model]) return 'service';
  if (PARKS[model]) return 'park';
  if (LANDMARKS[model]) return 'landmark';
  if (SHOPS[model]) return 'shop';
  if (INDUSTRY[model]) return 'industry';
  return null;
}

const configOf = (model) => SERVICES[model] || PARKS[model] || LANDMARKS[model] || SHOPS[model] || INDUSTRY[model];

// What a placed record (or a preview lot { model, gx, gz, fw, fd }) contributes. null when it contributes nothing.
export function sourceOf(rec) {
  const kind = kindOf(rec && rec.model);
  if (!kind) return null;
  const cfg = configOf(rec.model);
  return {
    id: rec.id, model: rec.model, kind,
    gx: rec.gx, gz: rec.gz, fw: rec.fw, fd: rec.fd,
    radius: cfg.radius, strength: cfg.strength,
    upkeep: cfg.upkeep || 0, coins: cfg.coins || 0,
  };
}

// A grown lot on zoned ground (a 1 x 1 tile at grid index i). Commercial lots are shops, Industrial lots are industry,
// and every other zone gives nothing. Stronger with level, a little.
export function lotSource(i, zone, level) {
  const kind = zone === 2 ? 'shop' : zone === 3 ? 'industry' : null;
  if (!kind) return null;
  const cfg = kind === 'shop' ? SHOP_LOT : INDUSTRY_LOT;
  return {
    id: 'z' + i, model: 'lot', kind,
    gx: i % GRID_N, gz: (i / GRID_N) | 0, fw: 1, fd: 1,
    radius: cfg.radius, strength: cfg.strength * LOT_LEVEL_SCALE(level),
    upkeep: 0, coins: 0,
  };
}

// Calls fn(x, z, weight) for every tile a source reaches. Weight is 1 at the footprint's edge and fades to 0 at radius + 1.
// No allocation per tile: the happiness map calls this for every source on every rebuild.
export function eachReach(s, fn) {
  const x1 = s.gx + s.fw - 1, z1 = s.gz + s.fd - 1, R = s.radius;
  for (let z = Math.max(0, s.gz - R); z <= Math.min(GRID_N - 1, z1 + R); z++) {
    const dz = Math.max(s.gz - z, 0, z - z1);
    for (let x = Math.max(0, s.gx - R); x <= Math.min(GRID_N - 1, x1 + R); x++) {
      const d = Math.max(Math.max(s.gx - x, 0, x - x1), dz);
      if (d <= R) fn(x, z, s.strength * (1 - d / (R + 1)));
    }
  }
}

// The same reach as a list of [gx, gz, weight], for drawing.
export function reachOf(s) {
  const out = [];
  eachReach(s, (x, z, w) => out.push([x, z, w]));
  return out;
}

// Happiness per tile in [0, 1], one Float32Array of GRID_N squared (row = gz). Pure: the same sources give the same map.
// Uplift (services, parks, landmarks, shops) saturates, so ten clinics do not make a town perfect; the base is what an
// uncovered tile feels. Industry sources pull the tile down instead, also saturating, and never below MOOD.floor.
export function happinessMap(sources) {
  const up = new Float32Array(AREA), down = new Float32Array(AREA);
  for (const s of sources) {
    const into = s.kind === 'industry' ? down : up;
    eachReach(s, (x, z, w) => { into[z * GRID_N + x] += w; });
  }
  const out = new Float32Array(AREA);
  for (let i = 0; i < AREA; i++) {
    const lift = MOOD.base + (1 - MOOD.base) * up[i] / (up[i] + MOOD.saturation);
    const drag = MOOD.industryMax * down[i] / (down[i] + MOOD.industrySaturation);
    out[i] = Math.min(1, Math.max(MOOD.floor, lift - drag));
  }
  return out;
}

// The homes (grid indices) that gained at least gainMin from one change: the animation's list. Biggest gains first, capped.
// `homes` is a Uint8Array of GRID_N squared, 1 on a home tile.
export function gainsOf(prev, next, homes, min = MOOD.gainMin, cap = MOOD.gainCap) {
  const out = [];
  for (let i = 0; i < AREA; i++) {
    if (!homes[i]) continue;
    const d = next[i] - prev[i];
    if (d >= min) out.push([i % GRID_N, (i / GRID_N) | 0, d]);
  }
  out.sort((a, b) => b[2] - a[2]);
  return out.slice(0, cap);
}

// Zoning growth multiplier from the average happiness of built tiles. 1 with nothing built yet.
export function growthOf(avg, built) {
  if (!built) return 1;
  const g = 1 + (avg - 0.5) * MOOD.growthSwing;
  return Math.min(MOOD.growthMax, Math.max(MOOD.growthMin, g));
}

// One short line for a tooltip: what a model does for the tiles around it.
export function describeModel(model) {
  const kind = kindOf(model);
  if (!kind) return '';
  const cfg = configOf(model);
  if (kind === 'industry') return 'Eases happiness on ' + cfg.radius + ' tiles around it, a little';
  const near = 'Lifts happiness on ' + cfg.radius + ' tiles around it';
  if (kind === 'shop') return near;
  if (kind === 'landmark') return near + ' · +' + cfg.coins + ' coins/s';
  return near + ' · upkeep ' + cfg.upkeep.toFixed(2) + ' coins/s';
}
