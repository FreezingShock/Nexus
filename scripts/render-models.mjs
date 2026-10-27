// Software snapshots of the building models, run in Node (no browser, no GPU): `node scripts/render-models.mjs <outDir> [modelId ...]`.
// Builds each model at levels 1 and 5 (and every drawn size), projects the real triangles isometrically with a z-buffer,
// shades them in the three flat tone bands the game uses, draws wall windows from the texture UVs and inks the outlines
// where depth or part changes. It is a faithful preview of the geometry, not of the game's lighting, sky or textures.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
const THREE = await import('../vendor/three/three.module.min.js');
const { MODELS, describe, footprintsOf, canonicalDims } = await import('../src/world/models.js');
const { buildParts } = await import('../src/render/models/builders.js');
const { PAL } = await import('../src/world/palettes.js');

const [out = 'model-snapshots', ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

// ---- PNG writer ----
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- rasterizer ----
const SS = 2, W = 420, H = 420, PW = W * SS, PH = H * SS;
const YAW = -Math.PI / 4 + 0.25, PITCH = Math.atan(1 / Math.SQRT2) * 0.95;   // looking down at the front-right corner
const LIGHT = new THREE.Vector3(-0.45, 0.8, 0.5).normalize();
const view = new THREE.Matrix4().makeRotationX(PITCH).multiply(new THREE.Matrix4().makeRotationY(YAW));
const bands = (n) => (n > 0.72 ? 1.0 : n > 0.3 ? 0.84 : 0.68);   // three flat tone bands, as the toon material does
const SKY = [237, 228, 208], INK = [43, 38, 32];

function render(parts, scale, cy, half = 3.2) {
  const col = new Uint8Array(PW * PH * 3), depth = new Float32Array(PW * PH).fill(-1e9), id = new Int32Array(PW * PH).fill(-1);
  for (let i = 0; i < PW * PH; i++) { col[i * 3] = SKY[0]; col[i * 3 + 1] = SKY[1]; col[i * 3 + 2] = SKY[2]; }
  const ground = [196, 200, 150];
  // a ground tile under the building so it reads as sitting somewhere
  const tri = (a, b, c, color, uvs, wall, pid, n) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(PW - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(PH - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2], o = y * PW + x;
      if (z <= depth[o]) continue;
      depth[o] = z; id[o] = pid;
      let rgb = color;
      if (wall && uvs && Math.abs(n.y) < 0.5) {   // windows: one cell per bay and storey, as the wall texture draws them
        const u = l1 * uvs[0][0] + l2 * uvs[1][0] + l3 * uvs[2][0], v = l1 * uvs[0][1] + l2 * uvs[1][1] + l3 * uvs[2][1];
        const fu = u - Math.floor(u), fv = v - Math.floor(v);
        if (fu > 0.28 && fu < 0.72 && fv > 0.2 && fv < 0.78) rgb = fu > 0.3 && fu < 0.7 && fv > 0.22 && fv < 0.76 ? [127, 152, 166] : [250, 243, 228];
      }
      col[o * 3] = rgb[0]; col[o * 3 + 1] = rgb[1]; col[o * 3 + 2] = rgb[2];
    }
  };
  const proj = (v) => [v.x * scale + PW / 2, PH / 2 - (v.y - cy) * scale, v.z];
  const gtri = (p, q, r) => tri(proj(p), proj(q), proj(r), ground, null, false, -2, new THREE.Vector3(0, 1, 0));
  const g = half;
  const gv = [[-g, 0, -g], [g, 0, -g], [g, 0, g], [-g, 0, g]].map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(view));
  gtri(gv[0], gv[1], gv[2]); gtri(gv[0], gv[2], gv[3]);
  parts.forEach((p, pi) => {
    const geo = p.geo, pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index, n = idx ? idx.count : pos.count;
    const m = p.local;
    const base = [p.color.r * 255, p.color.g * 255, p.color.b * 255];
    const wallHex = p.facadeMat ? p.wallRgb : null;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      const wv = [ia, ib, ic].map((j) => new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(m));
      const nrm = new THREE.Vector3().subVectors(wv[1], wv[0]).cross(new THREE.Vector3().subVectors(wv[2], wv[0])).normalize();
      const cv = wv.map((q) => q.clone().applyMatrix4(view)), cn = nrm.clone().transformDirection(view);
      if (cn.z <= 0) continue;   // back face
      const shade = bands(Math.max(0, nrm.dot(LIGHT)));
      const c0 = wallHex || base, color = [c0[0] * shade, c0[1] * shade, c0[2] * shade];
      tri(proj(cv[0]), proj(cv[1]), proj(cv[2]), color, uv ? [ia, ib, ic].map((j) => [uv.getX(j), uv.getY(j)]) : null, !!wallHex, pi, nrm);
    }
  });
  // ink where the part changes or the depth jumps
  const outc = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g2 = 0, b = 0, ink = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x * SS + sx, Y = y * SS + sy, o = Y * PW + X;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const X2 = X + dx, Y2 = Y + dy; if (X2 >= PW || Y2 >= PH) continue;
        const o2 = Y2 * PW + X2;
        if (id[o] !== id[o2] && !(id[o] === -2 || id[o2] === -2) ) edge = true;
        else if (id[o] !== id[o2] && (id[o] === -1 || id[o2] === -1)) edge = true;
        else if (Math.abs(depth[o] - depth[o2]) > 0.18 * scale / 18 && id[o] !== -1) edge = true;
      }
      if (edge) { ink++; r += INK[0]; g2 += INK[1]; b += INK[2]; } else { r += col[o * 3]; g2 += col[o * 3 + 1]; b += col[o * 3 + 2]; }
    }
    const q = SS * SS, o = (y * W + x) * 3;
    outc[o] = r / q; outc[o + 1] = g2 / q; outc[o + 2] = b / q;
  }
  return outc;
}

// wall colour for body parts, from the palette
const parse = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const files = [], sheet = [];
for (const m of MODELS) {
  if (only.length && !only.includes(m.id)) continue;
  for (const [si, size] of footprintsOf(m).slice(0, 3).entries()) for (const lv of [1, 5]) {
    const [fw, fd] = canonicalDims(m, size);
    const desc = describe({ id: 'b1001', model: m.id, gx: 10, gz: 10, fw, fd, rot: 0 }, lv);
    const parts = buildParts(desc);
    for (const p of parts) if (p.facadeMat) p.wallRgb = parse(PAL[desc.pal].wall);
    const big = Math.max(desc.w, desc.d, desc.floors * 1.2 + 3);
    const img = render(parts, PW / (big * 1.7), desc.floors * 0.55, Math.max(desc.w, desc.d) / 2 + 0.6);
    const name = `${m.id}-${fw}x${fd}-L${lv}.png`;
    writeFileSync(`${out}/${name}`, png(W, H, img));
    files.push(name);
    if (lv === 5 && si === 0) sheet.push(img);
  }
}
// one contact sheet: the level-5 look of every model (its smallest size), four to a row
if (sheet.length) {
  const cols = 4, rows = Math.ceil(sheet.length / cols), SW = W * cols, buf = Buffer.alloc(SW * H * rows * 3, 0xE0);
  sheet.forEach((img, i) => { const cx = (i % cols) * W, cy = Math.floor(i / cols) * H; for (let y = 0; y < H; y++) img.copy(buf, ((cy + y) * SW + cx) * 3, y * W * 3, (y + 1) * W * 3); });
  writeFileSync(`${out}/sheet.png`, png(SW, H * rows, buf));
  files.push('sheet.png');
}
console.log(files.join('\n'));
