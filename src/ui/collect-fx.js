// Collecting the postcard: coin and part icons burst out of the button, hang for a breath, then fly into their HUD
// counters. Each one that lands ticks its counter up by its share and squeezes the plaque, with a clink. The sim already
// holds the new totals; the HUD holds back the part still in flight (hud.hold), so the number climbs as the icons land.
import { playCue } from '../audio/cuehub.js';

// How many icons for an amount: a few for a little, more for a lot, never a swarm.
export function iconCount(amount, max = 14) {
  if (!(amount >= 1)) return 0;
  return Math.max(4, Math.min(max, Math.round(3 + Math.log10(amount) * 2)));
}

// Split an amount into n whole shares that add up exactly; the last landing gets the remainder.
export function shares(amount, n) {
  const total = Math.floor(amount), out = [];
  if (n <= 0) return out;
  const each = Math.floor(total / n);
  for (let i = 0; i < n; i++) out.push(i === n - 1 ? total - each * (n - 1) : each);
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);
// Where an icon is at time t (seconds). It bursts out from `a` along v, slows, then curves into `b`.
export function flightAt(p, t) {
  if (t <= p.burst) {
    const k = 1 - Math.exp(-6 * t / p.burst) ;
    return { x: p.a.x + p.v.x * k, y: p.a.y + p.v.y * k + 40 * (t / p.burst) ** 2, s: 0.6 + 0.6 * Math.min(1, t / 0.12), done: false };
  }
  const u = Math.min(1, (t - p.burst) / p.fly), e = u * u; // eases in, so it lands with a snap
  const k = 1 - Math.exp(-6);
  const m = { x: p.a.x + p.v.x * k, y: p.a.y + p.v.y * k + 40 };
  const c = { x: m.x + (m.x - p.a.x) * 0.5, y: Math.min(m.y, p.b.y) - 80 };
  const x = (1 - e) ** 2 * m.x + 2 * (1 - e) * e * c.x + e * e * p.b.x;
  const y = (1 - e) ** 2 * m.y + 2 * (1 - e) * e * c.y + e * e * p.b.y;
  return { x, y, s: 1.2 - 0.55 * ease(u), done: u >= 1 };
}

const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.width > 0 && r.height > 0 }; };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// from: the button. kinds: [{ key: 'coins', amount, target (the HUD badge), icon (svg markup), onLand(share, last) }].
export function burst(from, kinds) {
  const start = centre(from);
  const live = kinds.filter((k) => k.amount >= 1);
  const landNow = () => live.forEach((k) => k.onLand(Math.floor(k.amount), true));
  if (reduced() || !start.ok) { landNow(); return; }

  const layer = document.createElement('div');
  layer.className = 'fx-collect';
  document.body.appendChild(layer);
  const parts = [];
  live.forEach((k, ki) => {
    const end = centre(k.target);
    if (!end.ok) { k.onLand(Math.floor(k.amount), true); return; }
    const n = iconCount(k.amount), cut = shares(k.amount, n);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, r = 70 + Math.random() * 90;
      const el = document.createElement('span');
      el.className = 'fx-ico ' + k.key;
      el.innerHTML = k.icon;
      layer.appendChild(el);
      parts.push({ el, k, share: cut[i], last: i === n - 1, a: start, b: end, v: { x: Math.cos(ang) * r * 1.3, y: Math.sin(ang) * r },
        delay: ki * 0.08 + i * 0.012, burst: 0.32 + Math.random() * 0.08, fly: 0.42 + i * 0.045 + Math.random() * 0.05,
        spin: (Math.random() - 0.5) * 540 });
    }
  });
  playCue('burst');

  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / 1000;
    let left = 0;
    for (const p of parts) {
      if (p.landed) continue;
      const lt = t - p.delay;
      if (lt < 0) { left++; p.el.style.opacity = '0'; continue; }
      const q = flightAt(p, lt);
      p.el.style.opacity = '1';
      p.el.style.transform = `translate(${q.x}px,${q.y}px) translate(-50%,-50%) rotate(${p.spin * Math.min(1, lt)}deg) scale(${q.s})`;
      if (q.done) {
        p.landed = true; p.el.remove();
        p.k.onLand(p.share, p.last);
        playCue(p.k.key === 'coins' ? 'coin' : 'part', { n: parts.filter((o) => o.landed && o.k === p.k).length });
      } else left++;
    }
    if (left) requestAnimationFrame(step); else layer.remove();
  };
  requestAnimationFrame(step);
}
