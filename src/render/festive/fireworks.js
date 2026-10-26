// Fireworks: rockets that climb and burst into sparks. Pure (no THREE): a pool of plain arrays stepped on the CPU, so the
// tests can run it. A rocket is one bright particle rising on a slight curve; at the top it bursts into a shell of sparks
// that slow, fall and fade. Shells: 'peony' (a round ball), 'ring' (a flat ring tipped towards the camera), 'willow'
// (gold, long and drooping), 'crackle' (small and quick, many twinkles).
export const POOL = 2400;
const G = 5.5;            // gravity on sparks, world units per second squared
export const SHELLS = ['peony', 'peony', 'ring', 'willow', 'crackle'];

export function makePool(n = POOL) {
  return {
    n, next: 0,
    age: new Float32Array(n).fill(-1), life: new Float32Array(n),
    px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    drag: new Float32Array(n), grav: new Float32Array(n), size: new Float32Array(n),
    r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
    rocket: new Uint8Array(n), shell: new Uint8Array(n), twinkle: new Float32Array(n),
    // what the shader reads
    pos: new Float32Array(n * 3), col: new Float32Array(n * 3), alpha: new Float32Array(n), outSize: new Float32Array(n),
  };
}

function slot(p) {
  for (let k = 0; k < p.n; k++) { const i = (p.next + k) % p.n; if (p.age[i] < 0) { p.next = (i + 1) % p.n; return i; } }
  const i = p.next; p.next = (i + 1) % p.n; return i; // full: reuse the oldest-ish
}
const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// Sends a rocket up from (x, y, z) to burst `height` above, in `color` (0xRRGGBB) with a shell kind (index into SHELLS).
export function launch(p, x, y, z, height, color, shell, rnd = Math.random) {
  const i = slot(p), t = 1.1 + rnd() * 0.4;
  p.age[i] = 0; p.life[i] = t; p.rocket[i] = 1; p.shell[i] = shell;
  p.px[i] = x; p.py[i] = y; p.pz[i] = z;
  p.vx[i] = (rnd() - 0.5) * 1.2; p.vz[i] = (rnd() - 0.5) * 1.2; p.vy[i] = height / t + G * 0.15 * t;
  p.drag[i] = 0; p.grav[i] = G * 0.3; p.size[i] = 5;
  [p.r[i], p.g[i], p.b[i]] = hexRGB(color);
  p.twinkle[i] = 0;
  return i;
}

// The shell of sparks for a rocket that has reached its top.
function burst(p, i, rnd, effects) {
  const kind = SHELLS[p.shell[i]] || 'peony', x = p.px[i], y = p.py[i], z = p.pz[i];
  const base = [p.r[i], p.g[i], p.b[i]];
  const count = Math.round((kind === 'crackle' ? 70 : kind === 'willow' ? 60 : 90) * Math.max(0.3, effects));
  const speed = kind === 'willow' ? 6 : kind === 'crackle' ? 5 : 8;
  for (let k = 0; k < count; k++) {
    const j = slot(p);
    let dx, dy, dz;
    if (kind === 'ring') { const a = (k / count) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.9; dz = Math.sin(a) * 0.45; }
    else { // an even-ish point on a sphere
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      dx = s * Math.cos(a); dy = u; dz = s * Math.sin(a);
    }
    const sp = speed * (kind === 'ring' ? 1 : 0.75 + rnd() * 0.3);
    p.age[j] = 0; p.rocket[j] = 0; p.shell[j] = p.shell[i];
    p.life[j] = kind === 'willow' ? 2.6 + rnd() * 0.8 : kind === 'crackle' ? 0.9 + rnd() * 0.5 : 1.5 + rnd() * 0.6;
    p.px[j] = x; p.py[j] = y; p.pz[j] = z;
    p.vx[j] = dx * sp; p.vy[j] = dy * sp; p.vz[j] = dz * sp;
    p.drag[j] = kind === 'willow' ? 1.6 : 1.1; p.grav[j] = kind === 'willow' ? G * 0.8 : G * 0.5;
    p.size[j] = kind === 'crackle' ? 3 : 4.5;
    const gold = kind === 'willow' ? [1, 0.8, 0.42] : base, mix = kind === 'willow' ? 0 : rnd() * 0.25;
    p.r[j] = gold[0] + (1 - gold[0]) * mix; p.g[j] = gold[1] + (1 - gold[1]) * mix; p.b[j] = gold[2] + (1 - gold[2]) * mix;
    p.twinkle[j] = kind === 'crackle' ? 1 : kind === 'willow' ? 0.4 : 0.15;
  }
}

// Steps every particle by dt. Returns { alive, bursts } where bursts is how many rockets burst this step (for sound).
export function stepPool(p, dt, rnd = Math.random, effects = 1, t = 0) {
  let alive = 0, bursts = 0;
  for (let i = 0; i < p.n; i++) {
    if (p.age[i] < 0) { p.alpha[i] = 0; continue; }
    p.age[i] += dt;
    if (p.age[i] >= p.life[i]) {
      if (p.rocket[i]) { burst(p, i, rnd, effects); bursts++; }
      p.age[i] = -1; p.alpha[i] = 0; continue;
    }
    alive++;
    const k = Math.exp(-p.drag[i] * dt);
    p.vx[i] *= k; p.vz[i] *= k; p.vy[i] = p.vy[i] * k - p.grav[i] * dt;
    p.px[i] += p.vx[i] * dt; p.py[i] += p.vy[i] * dt; p.pz[i] += p.vz[i] * dt;
    const left = p.life[i] - p.age[i], a = p.age[i];
    let alpha = p.rocket[i] ? 0.9 : Math.min(1, a / 0.05) * Math.min(1, left / (p.life[i] * 0.45));
    if (p.twinkle[i]) alpha *= 1 - p.twinkle[i] * (0.5 + 0.5 * Math.sin(t * 40 + i * 1.7));
    p.alpha[i] = alpha;
    p.outSize[i] = p.size[i] * (p.rocket[i] ? 1 : 0.6 + 0.4 * Math.min(1, left / 0.6));
    const o = i * 3;
    p.pos[o] = p.px[i]; p.pos[o + 1] = p.py[i]; p.pos[o + 2] = p.pz[i];
    p.col[o] = p.r[i]; p.col[o + 1] = p.g[i]; p.col[o + 2] = p.b[i];
  }
  return { alive, bursts };
}

// How many rockets a second, by the hour of a fireworks night: none by day, a steady show after dark, and a finale
// around midnight. 0 outside the show.
export function showRate(hour, night) {
  if (night < 0.5) return 0;
  const h = hour < 12 ? hour + 24 : hour; // 20 .. 30, so midnight is 24
  if (h < 20.5 || h > 25) return 0;
  if (h > 23.6 && h < 24.4) return 3.2; // the finale
  return 0.8;
}
