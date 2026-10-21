// Seeded mulberry32. Call order matters: the town layout depends on it.
export function makeRng(seed) {
  let s = seed | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.pick = (a) => a[Math.floor(rng() * a.length)];
  return rng;
}
