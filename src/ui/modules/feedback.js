// Gentle feedback: the small answers the town gives to what you do and to what happens in it. Counters that pop when they
// rise, a tiny "+N" floating where income is earned, a ring where you tap the map, a bounce when a building is placed, a
// sparkle and a chime on a repaint, a welcome puff and chime when a family comes through the tunnel, and a few hearts when
// the town gets happier. Everything is cosmetic: it reads the sim and the settings, writes nothing, and scales with Graphics
// "Dust and hearts" (off: nothing, light: fewer and rarer, full: all) and with reduced motion (no motion, the counters still update).
import { playCue } from '../../audio/cuehub.js';
import { renderSettings } from '../../core/quality.js';
import { TUNNEL_GATE } from '../../world/starter.js';
import { tileCenter } from '../../world/grid.js';
import { heightAt } from '../../world/terrain.js';
import { modelById } from '../../world/models.js';
import { fmtCompact } from '../format.js';

export const FAMILY = 3;            // people per "family" that arrives with a chime
export const WELCOME_GAP_S = 6;     // the welcome never repeats faster than this
export const HEARTS_GAP_S = 20;     // nor do the hearts for a happier town
export const HEARTS_RISE = 0.02;    // average happiness must climb this far over the last baseline for hearts
export const POP_GAP_S = 0.8;       // a counter pops at most this often, so a steady trickle stays calm

// Families that moved in between two readings of the population. Zero for a drop (Renewal) or a jump (offline catch-up, import).
export function familiesBetween(prev, now) {
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev < 0 || now < 0) return 0;
  const n = Math.floor(now / FAMILY) - Math.floor(prev / FAMILY);
  return n > 0 && n <= 3 ? n : 0;
}

// Seconds between "+N" floats over the town at a Dust and hearts level (effects 0 to 1). Infinity when off.
export function floatEvery(effects) { return effects >= 1 ? 4 : effects > 0 ? 9 : Infinity; }

// The label for a gain: "+12", "+1.4K". Under one coin there is nothing to show.
export function gainLabel(n) { return n >= 1 ? '+' + fmtCompact(n) : ''; }

import { calmer } from '../../core/access.js';
const mk = (cls, text) => { const n = document.createElement('div'); n.className = cls; if (text) n.textContent = text; return n; };

export default {
  id: 'feedback',
  create({ sim, scene, quality }) {
    const fx = () => (quality ? renderSettings(quality.get()).effects : 1);
    const layer = mk('fx-layer'); layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    const spawn = (el, ms) => { layer.append(el); setTimeout(() => el.remove(), ms); };

    // ---- counters: a soft pop when a number rises ----
    const watch = [['coins', 'coins'], ['parts', 'parts']].map(([id, key]) => ({ el: document.getElementById(id), key, last: null, at: -9 }));
    function bump(w, t) {
      if (!w.el || calmer() || fx() === 0) return;
      w.at = t;
      w.el.classList.remove('fx-bump'); void w.el.offsetWidth; w.el.classList.add('fx-bump');
    }

    // ---- tap ring: instant answer where you click the map ----
    const stage = document.getElementById('stage');
    if (stage) {
      let down = null;
      stage.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
      stage.addEventListener('pointerup', (e) => {
        if (!down || calmer() || fx() === 0) { down = null; return; }
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        down = null;
        if (moved > 5) return; // a drag pans the map; it is not a tap
        const ring = mk('fx-ring');
        ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
        spawn(ring, 480);
      });
    }

    // ---- income floats over the town ----
    let gained = 0, floatAt = 0;
    function floatIncome(t) {
      const text = gainLabel(gained);
      if (!text) return;
      const recs = sim.placedRecords ? sim.placedRecords() : [];
      const r = recs.length ? recs[Math.floor(Math.random() * recs.length)] : null;
      const b = r && sim.building(r.id);
      if (!b) return;
      const p = scene.project(b.x, heightAt(b.x, b.z) + 5, b.z);
      if (!p) return;
      gained = 0; floatAt = t;
      const el = mk('fx-float', text);
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      spawn(el, 1700);
    }

    // ---- the town's own moments ----
    let lastWelcome = -99, lastHearts = -99, baseline = null, lastPlaced = -99, popPrev = null, checkAt = 0;
    function welcome(t) {
      if (t - lastWelcome < WELCOME_GAP_S) return;
      lastWelcome = t;
      playCue('arrive');
      if (calmer() || fx() === 0) return;
      const [x, z] = tileCenter(TUNNEL_GATE.gx, TUNNEL_GATE.gz);
      const puffs = scene.sys('puffs'), hearts = scene.sys('happy-fx');
      if (puffs) puffs.burst(x - 2, z, 1.8, 7);
      if (hearts) hearts.bloom(x - 2, z, 2, 2);
    }
    function heartsOverHomes(t) {
      lastHearts = t;
      const homes = (sim.placedRecords ? sim.placedRecords() : []).filter((r) => { const m = modelById(r.model); return m && m.cat === 'home'; });
      const hearts = scene.sys('happy-fx');
      if (!homes.length || !hearts) return;
      for (let k = 0; k < Math.min(4, homes.length); k++) {
        const r = homes[Math.floor(Math.random() * homes.length)];
        const [x, z] = tileCenter(r.gx, r.gz);
        hearts.bloom(x, z, 1, 0);
      }
    }

    return {
      onEvent(e) {
        const now = performance.now() / 1000;
        if (e.type === 'placed') {
          lastPlaced = now;
          if (!calmer()) scene.settle(e.id);
        } else if (e.type === 'painted') {
          const b = sim.building(e.id);
          if (b && !calmer() && fx() > 0) { const h = scene.sys('happy-fx'); if (h) h.bloom(b.x, b.z, 0, 3); }
        }
      },
      frame(dt, t) {
        const now = performance.now() / 1000, s = sim.state;
        for (const w of watch) {
          const v = s[w.key];
          if (w.last !== null && v > w.last + 0.01) {
            if (w.key === 'coins') gained += v - w.last;
            if (now - w.at >= POP_GAP_S) bump(w, now);
          }
          w.last = v;
        }
        if (now - floatAt >= floatEvery(fx()) && !calmer()) floatIncome(now);
        if (now < checkAt) return;
        checkAt = now + 1;
        const pop = s.pop;
        if (popPrev !== null) {
          if (familiesBetween(popPrev, pop)) welcome(now);
        }
        popPrev = pop;
        const avg = sim.services && sim.services.average ? sim.services.average() : null;
        if (avg !== null) {
          if (baseline === null || avg < baseline) baseline = avg;
          // A new building has its own celebration (services.js); this one is for growth and upgrades that lifted the town.
          if (avg - baseline >= HEARTS_RISE) {
            if (now - lastHearts >= HEARTS_GAP_S && now - lastPlaced > 4 && !calmer() && fx() > 0) heartsOverHomes(now);
            baseline = avg;
          }
        }
      },
    };
  },
};
