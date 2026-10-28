// The little street along the foot of the progress screen: a road is laid, then houses go up lot by lot (stakes, scaffold,
// walls rising, roof dropping in, windows lighting, a tree or a lamp), rest a moment, fade, and a new street begins.
// Plain canvas 2D, drawn from code, no images. Calm motion draws the finished street once and stays still.

export const SCENE_H = 168;
const LOT_W = 96, GROUND = 38; // a lot's width, and the strip of road and verge under the houses
const WALLS = ['#F3E7D3', '#EAE1D5', '#E6C98A', '#D9B9A0', '#C9D6B0', '#E8D5C0'];
const ROOFS = ['#B8472E', '#97553E', '#C96F4F', '#35566A', '#7A6A58'];
const WOOD = '#A07A4A';

const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const back = (x) => { x = Math.min(1, Math.max(0, x)); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const span = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));

// A small seeded random, so a street is the same whenever it is redrawn.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The houses of one street: n lots, each with a look.
export function streetOf(cycle, n) {
  const r = seeded(cycle * 7919 + 13);
  const pick = (list) => list[Math.floor(r() * list.length)];
  return Array.from({ length: n }, () => {
    const kind = Math.floor(r() * 4); // 0 cottage, 1 terrace, 2 tower, 3 shop
    const w = [62, 56, 40, 66][kind] + Math.round(r() * 8), h = [40, 58, 84, 44][kind] + Math.round(r() * 10);
    return { kind, w, h, wall: pick(WALLS), roof: pick(ROOFS), extra: r() < 0.55 ? 'tree' : 'lamp', off: Math.round(r() * 8) };
  });
}

// The times of one street, in seconds: lots start `step` apart, each takes BUILD, then the finished street rests and fades.
export const BUILD = 3.4, REST = 2.6, FADE = 0.8;
export function timeline(n, width) {
  const step = Math.min(0.72, 9 / Math.max(1, n));
  const lastEnds = 0.5 + (n - 1) * step + BUILD;
  return { step, lastEnds, total: lastEnds + REST + FADE, restAt: lastEnds + 0.1, width };
}

export function createBootScene(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { frame() {}, stop() {} };
  const calm = opts.calm || (() => false);
  const colors = { ink: '#2B2620', paper: '#FBF6EA', sage: '#8FA65A', hill: '#A8C179', road: '#8A8173' };
  const readColors = () => {
    try {
      const cs = getComputedStyle(canvas);
      for (const k of ['ink', 'paper']) { const v = cs.getPropertyValue('--' + k).trim(); if (v) colors[k] = v; }
    } catch { /* keep the defaults */ }
  };
  let W = 0, H = SCENE_H, dpr = 1, t = 0, cycle = 0, street = [], tl = timeline(1, 0), drewStill = false, colored = false;

  function size() {
    const w = Math.max(1, Math.round(canvas.clientWidth));
    if (w === W && canvas.width) return false;
    W = w; dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const n = Math.ceil(W / LOT_W) + 1;
    tl = timeline(n, W); street = streetOf(cycle, n);
    return true;
  }

  const rect = (x, y, w, h, fill, lw = 2) => { ctx.fillStyle = fill; ctx.lineWidth = lw; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); };
  const poly = (pts, fill, lw = 2) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.lineWidth = lw; ctx.fill(); ctx.stroke(); };
  const disc = (x, y, r, fill, lw = 2) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.stroke(); };

  // One house at left edge x on ground line gy. `p` holds the 0..1 progress of each stage.
  function house(v, x, gy, p, time) {
    const { w, h } = v, wallH = h * ease(p.wall), top = gy - wallH;
    if (p.stakes > 0 && p.wall < 0.05) { // a few stakes and a string mark the plot
      const s = ease(p.stakes) * 9;
      for (const sx of [x - 3, x + w + 3]) { ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx, gy - s); ctx.lineWidth = 3; ctx.strokeStyle = WOOD; ctx.stroke(); }
      ctx.strokeStyle = colors.ink;
    }
    if (p.wall > 0) rect(x, top, w, wallH, v.wall);
    if (p.scaf > 0 && p.wall > 0) { // scaffold poles and planks, standing while the walls rise
      ctx.save(); ctx.globalAlpha = p.scaf; ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.6;
      const sh = wallH + 12;
      for (const sx of [x - 7, x + w + 7]) { ctx.fillStyle = WOOD; ctx.fillRect(sx - 2, gy - sh, 4, sh); ctx.strokeRect(sx - 2, gy - sh, 4, sh); }
      for (let y = 16; y < sh; y += 18) { ctx.fillStyle = WOOD; ctx.fillRect(x - 9, gy - y, w + 18, 4); ctx.strokeRect(x - 9, gy - y, w + 18, 4); }
      ctx.restore();
    }
    if (p.roof > 0) {
      const drop = (1 - back(p.roof)) * -46, a = Math.min(1, p.roof * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, drop);
      const base = gy - h;
      if (v.kind === 1) { // terrace: a flat slab with a chimney
        rect(x + w * 0.65, base - 18, 9, 18, '#C96F4F', 1.8);
        rect(x - 4, base - 9, w + 8, 9, v.roof);
      } else if (v.kind === 2) { // tower: a narrow spire
        poly([[x - 4, base], [x + w / 2, base - 40], [x + w + 4, base]], v.roof);
        ctx.beginPath(); ctx.moveTo(x + w / 2, base - 40); ctx.lineTo(x + w / 2, base - 52); ctx.lineWidth = 2; ctx.stroke();
        poly([[x + w / 2, base - 52], [x + w / 2 + 10, base - 49], [x + w / 2, base - 46]], '#E6BC62', 1.5);
      } else { // cottage and shop: a gable
        if (v.kind === 0) rect(x + w * 0.68, base - 24, 9, 22, '#EAE1D5', 1.8);
        poly([[x - 6, base], [x + w / 2, base - 26 - (v.kind === 3 ? 0 : 6)], [x + w + 6, base]], v.roof);
      }
      ctx.restore();
    }
    if (p.detail > 0) {
      const s = back(p.detail);
      ctx.save(); ctx.translate(x + w / 2, gy); ctx.scale(s, s);
      rect(-5, -22, 10, 22, '#B8472E', 1.6); // door
      const rows = v.kind === 2 ? [-46, -68] : [-38];
      for (const wy of rows) for (const wx of v.kind === 2 ? [-6] : [-w / 2 + 7, w / 2 - 19]) rect(wx, wy, 12, 12, p.lit ? '#F2D27A' : '#BFD3DC', 1.6);
      if (v.kind === 3) for (let i = 0; i < 6; i++) rect(-w / 2 + 2 + i * ((w - 4) / 6), -26 - 12, (w - 4) / 6, 7, i % 2 ? '#FBF6EA' : '#B8472E', 1.2); // awning
      ctx.restore();
    }
    if (p.extra > 0) {
      const s = back(p.extra), ex = x + w + 12 + (v.off % 3);
      ctx.save(); ctx.translate(ex, gy); ctx.scale(s, s);
      if (v.extra === 'tree') { rect(-2, -14, 4, 14, '#97553E', 1.6); disc(0, -24, 11, '#6E8F4A'); }
      else { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.lineWidth = 2.4; ctx.stroke(); disc(0, -37, 5, p.lit ? '#F2D27A' : '#E9D6B2', 1.8); }
      ctx.restore();
      if (v.kind === 0 && p.extra > 0.6) { // chimney smoke
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.35 + i / 3) % 1;
          ctx.globalAlpha = (1 - k) * 0.55; disc(x + w * 0.68 + 4 + Math.sin(k * 5 + i) * 3, gy - h - 32 - k * 28, 3 + k * 5, '#FFF8EA', 1);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function paint(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = colors.ink;
    const gy = H - GROUND;
    // far hills and a few slow clouds, faint
    ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = colors.hill;
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, gy - 34 - 22 * Math.sin(x / 150 + 1) - 12 * Math.sin(x / 61));
    ctx.lineTo(W, gy); ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = colors.paper;
    for (let i = 0; i < 3; i++) {
      const cx = ((time * (6 + i * 3) + i * W * 0.37) % (W + 140)) - 70, cy = 22 + i * 17;
      ctx.beginPath(); ctx.ellipse(cx, cy, 34, 8, 0, 0, 6.2832); ctx.ellipse(cx - 14, cy - 5, 16, 8, 0, 0, 6.2832); ctx.ellipse(cx + 12, cy - 6, 18, 9, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // the street, fading out at the end of its rest
    const fade = 1 - span(time, tl.restAt + REST - 0.2, tl.total);
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    // verge and road
    const roadX = Math.min(W, Math.max(0, ((time - 0.2) / tl.step) * LOT_W + LOT_W * 0.3));
    ctx.fillStyle = colors.sage; ctx.globalAlpha *= 0.9; ctx.fillRect(0, gy, W, 10); ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    if (roadX > 0) {
      ctx.fillStyle = colors.road; ctx.fillRect(0, gy + 10, roadX, GROUND - 10 - 6);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, gy + 10); ctx.lineTo(roadX, gy + 10); ctx.moveTo(0, gy + GROUND - 6); ctx.lineTo(roadX, gy + GROUND - 6); ctx.stroke();
      ctx.save(); ctx.strokeStyle = '#FBF6EA'; ctx.lineWidth = 2.5; ctx.setLineDash([12, 12]); ctx.lineDashOffset = 0;
      ctx.beginPath(); ctx.moveTo(0, gy + 24); ctx.lineTo(roadX, gy + 24); ctx.stroke(); ctx.restore();
      if (roadX < W && time < tl.lastEnds) { // a cone stands where the road ends
        ctx.save(); ctx.translate(roadX + 6, gy + 26); poly([[-7, 0], [0, -17], [7, 0]], '#E08A3C', 1.8); rect(-9, 0, 18, 4, '#7A6A58', 1.6); ctx.restore();
      }
    }
    // the houses, back to front is just left to right
    for (let i = 0; i < street.length; i++) {
      const u = time - (0.5 + i * tl.step);
      if (u < 0) continue;
      const lit = time > tl.lastEnds - 1.2 || u > BUILD - 0.2;
      const x = i * LOT_W + 14 + street[i].off;
      house(street[i], x, gy + 2, {
        stakes: span(u, 0, 0.4), wall: span(u, 0.4, 1.7), scaf: 1 - span(u, 1.7, 2.3), roof: span(u, 1.7, 2.4),
        detail: span(u, 2.3, 2.9), extra: span(u, 2.7, 3.4), lit,
      }, time);
    }
    ctx.globalAlpha = 1;
  }

  return {
    frame(dt) {
      if (!colored) { readColors(); colored = true; }
      const resized = size();
      if (calm()) { // one finished street, and no motion
        if (resized || !drewStill) { t = tl.restAt; paint(t); drewStill = true; }
        return;
      }
      drewStill = false;
      t += Math.min(dt, 0.1);
      if (t >= tl.total) { t = 0; cycle++; street = streetOf(cycle, street.length); }
      paint(t);
    },
    refreshColors: readColors,
    stop() { ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
