// The Terrain tool (U): Raise, Lower or Flatten the land by dragging a soft brush over it. Flatten levels toward the height
// where the drag began. Roads, zones and buildings on the ground ride along with it. Each dab costs a few coins for the
// earth it moves; one drag is one Ctrl+Z. The mountain rim, the river and the tunnel mountain stay as they are.
// Reads the sim and sends terraform. Rules and the brush live in src/world/land.js and src/sim/systems/land.js.
import { BRUSH, C_EDGE, CN } from '../../world/land.js';
import { TILE } from '../../world/grid.js';
import { heightAt } from '../../world/terrain.js';
import { $, fmt } from '../format.js';
import { esc, tileCard } from '../cards.js';

const COIN = '<i class="coin"></i>';
const P = 'fill="none" stroke="#2B2620" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const TOOLS = [
  { id: 'raise', name: 'Raise', key: '1', sub: 'Lift the land into a hill or a terrace',
    pic: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 38Q18 36 24 22Q30 10 36 22Q42 36 56 38Z" fill="#A8C179" ${P}/><path d="M30 18V6M25 11L30 6L35 11" ${P}/></svg>` },
  { id: 'lower', name: 'Lower', key: '2', sub: 'Dig the land down: a dell, or a pond below the water line',
    pic: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 22Q18 24 24 34Q30 42 36 34Q42 24 56 22V40H4Z" fill="#C9A27A" ${P}/><ellipse cx="30" cy="34" rx="6" ry="2.5" fill="#8FC4D8" ${P}/><path d="M30 6V18M25 13L30 18L35 13" ${P}/></svg>` },
  { id: 'flatten', name: 'Flatten', key: '3', sub: 'Level the land to the height where you start dragging',
    pic: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 38V26H56V38Z" fill="#E6CF8E" ${P}/><path d="M8 18H52" ${P} stroke-dasharray="4 3"/><rect x="18" y="8" width="24" height="6" rx="2" fill="#B98558" ${P}/></svg>` },
];
const SIZES = [['small', 'S'], ['medium', 'M'], ['large', 'L']];
const DAB_S = 0.09; // a held brush dabs this often (seconds), and again whenever it moves a little

export default {
  id: 'terrain',
  create({ sim, send, scene }) {
    const fly = $('fly');
    const stage = scene.canvas.parentElement;
    const tag = document.createElement('div');
    tag.id = 'landlabel'; tag.dataset.mo = 'tag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true');
    $('app').appendChild(tag);

    let on = false, tool = 'raise', size = 'medium', hover = null, drag = null, pointer = { x: 0, y: 0 }, strokes = 0;
    const view = () => scene.sys('land-brush');
    const radius = () => BRUSH[size];
    // Can the brush shape anything here? The nearest tile corner is in reach.
    const reach = (p) => {
      const i = Math.round((p.x - C_EDGE) / TILE), j = Math.round((p.z - C_EDGE) / TILE);
      return i >= 0 && j >= 0 && i < CN && j < CN && sim.canShape(i, j);
    };

    function render() {
      const t = TOOLS.find((x) => x.id === tool);
      const cards = TOOLS.map((x) => tileCard({ pic: x.pic, title: x.name, tip: x.sub, key: x.key, pressed: x.id === tool, data: { lt: x.id } })).join('');
      const sizes = SIZES.map(([id, k]) => `<button type="button" class="tog" data-ls="${id}" aria-pressed="${id === size}" title="${esc(id[0].toUpperCase() + id.slice(1))} brush">${k}</button>`).join('');
      fly.innerHTML = `<div class="pbar"><div class="strip">${cards}</div></div>` +
        `<div class="pfoot"><b class="ptitle">Terrain</b><span class="lsizes" role="group" aria-label="Brush size">${sizes}</span>` +
        `<span class="pdetail" title="${esc(t.sub)}">${esc(t.sub)}</span>` +
        `<span class="dhint">Drag to shape · coins for the earth moved</span></div>`;
      fly.hidden = false;
    }
    fly.addEventListener('click', (e) => {
      if (!on) return;
      const b = e.target.closest('[data-lt],[data-ls]');
      if (!b || !fly.contains(b)) return;
      e.stopPropagation();
      if (b.dataset.lt) tool = b.dataset.lt; else size = b.dataset.ls;
      render(); paint();
    }, true);

    // ---- label and ring ----
    function say(html, cls = '') {
      tag.className = cls; tag.innerHTML = html; tag.hidden = false;
      const w = tag.offsetWidth, h = tag.offsetHeight;
      tag.style.transform = `translate(${Math.round(Math.max(8, Math.min(pointer.x + 18, innerWidth - w - 12)))}px,${Math.round(Math.min(pointer.y + 22, innerHeight - h - 12))}px)`;
    }
    function paint() {
      const v = view();
      const p = drag ? drag.at : hover;
      if (!on || !p) { if (v) v.hide(); tag.hidden = true; return; }
      const ok = reach(p);
      if (v) v.show(p.x, p.z, radius(), tool, ok);
      if (!ok) { say('The mountains and the river stay as they are', 'bad'); return; }
      if (drag && drag.paid) say(`${COIN}<b>−₵ ${fmt(drag.paid)}</b><small>${esc(TOOLS.find((x) => x.id === tool).name)}</small>`);
      else if (tool === 'flatten' && !drag) say(`<small>Level to</small><b>${(Math.max(0, heightAt(p.x, p.z)) * 4).toFixed(0)} m</b>`);
      else tag.hidden = true;
    }

    // ---- dabs ----
    function dab(first) {
      if (!drag) return;
      const c0 = sim.state.coins;
      send({ type: 'terraform', tool, x: drag.at.x, z: drag.at.z, size, level: drag.level, stroke: drag.stroke, first });
      drag.paid += Math.max(0, Math.round(c0 - sim.state.coins));
      drag.last = { x: drag.at.x, z: drag.at.z }; drag.wait = DAB_S;
    }

    // ---- pointer (capture phase on the stage, button 0 only; right and middle drag still pan) ----
    function onMove(e) {
      pointer = { x: e.clientX, y: e.clientY };
      hover = scene.ground(e.clientX, e.clientY);
      if (drag && hover) {
        drag.at = hover;
        if (Math.hypot(hover.x - drag.last.x, hover.z - drag.last.z) > radius() * 0.35) dab(false);
      }
      paint();
    }
    function onDown(e) {
      if (e.button === 2 && drag) { e.stopPropagation(); e.preventDefault(); drag = null; paint(); return; }
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      pointer = { x: e.clientX, y: e.clientY };
      const p = scene.ground(e.clientX, e.clientY);
      if (!p) return;
      drag = { at: p, last: p, level: heightAt(p.x, p.z), stroke: ++strokes, paid: 0, wait: DAB_S, id: e.pointerId };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      dab(true); paint();
    }
    function onUp(e) {
      if (e.button !== 0 || !drag || e.pointerId !== drag.id) return;
      e.stopPropagation();
      drag = null; paint();
    }
    const onLeave = () => { if (!drag) { hover = null; paint(); } };

    function activate() {
      if (on) return;
      on = true; render();
      stage.addEventListener('pointermove', onMove, true); stage.addEventListener('pointerdown', onDown, true);
      stage.addEventListener('pointerup', onUp, true); stage.addEventListener('pointerleave', onLeave);
    }
    function deactivate() {
      if (!on) return;
      on = false; hover = null; drag = null;
      stage.removeEventListener('pointermove', onMove, true); stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointerup', onUp, true); stage.removeEventListener('pointerleave', onLeave);
      const v = view(); if (v) v.hide();
      tag.hidden = true;
    }

    return {
      onTool(t) { if (t === 'terrain') activate(); else deactivate(); },
      onKey(e) {
        if (!on) return false;
        const t = TOOLS.find((x) => x.key === e.key);
        if (t) { tool = t.id; render(); paint(); return true; }
        if (e.key === 'Escape' && drag) { drag = null; paint(); return true; }
        return false;
      },
      // Holding still keeps working the ground, a dab every DAB_S; the ring follows the ground as it rises.
      frame(dt) {
        if (!on || !drag) return;
        drag.wait -= dt;
        if (drag.wait <= 0) { dab(false); paint(); }
      },
    };
  },
};
