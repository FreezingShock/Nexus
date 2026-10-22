// Terrain height, river and farmland masks. Pure math, shared by sim and render.
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const hash = (i, j) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const vn = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return hash(i, j) * (1 - u) * (1 - v) + hash(i + 1, j) * u * (1 - v) +
    hash(i, j + 1) * (1 - u) * v + hash(i + 1, j + 1) * u * v;
};

export const fbm = (x, y) => {
  let a = 0.5, s = 0, f = 1;
  for (let o = 0; o < 4; o++) { s += a * vn(x * f, y * f); a *= 0.5; f *= 2.07; }
  return s / 0.9375;
};

export const riverX = (z) => 52 + 7 * Math.sin(z * 0.045 + 0.6);
export const farmMask = (x, z) => (1 - smooth(26, 34, Math.abs(z))) * smooth(-33, -37, x);

export function heightAt(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const f = smooth(30, 85, d);
  let h = f * (Math.pow(fbm(x * 0.021 + 3.1, z * 0.021 + 7.7), 1.5) * 30 + fbm(x * 0.09, z * 0.09) * 1.6);
  h = Math.max(0, h - 0.8);
  // Beyond the old 64-tile grid (96 units out) the ground rolls gently, so the grown grid is mostly buildable plain. Inside
  // the old grid this is zero, so saved roads and zones keep the ground they were built on.
  const far = smooth(100, 124, d);
  if (far > 0) h = h * (1 - far) + (0.9 + 0.9 * fbm(x * 0.03 + 5.3, z * 0.03 - 2.1)) * far;
  h *= 1 - 0.99 * farmMask(x, z);
  if (x > 24) h *= smooth(3, 10, Math.abs(z));
  // The mountain east of the river. The valley road runs straight into its west face, where the tunnel is. The ground
  // there stays flat up to x = 71, so the gate tile and the road before it are level.
  if (x > 71) h += 30 * smooth(71, 80, x) * (1 - smooth(18, 34, Math.abs(z))) * (0.7 + 0.6 * fbm(x * 0.04, z * 0.04));
  const k = 1 - smooth(2.6, 6.5, Math.abs(x - riverX(z)));
  return h * (1 - k) + (-1.3) * k;
}
