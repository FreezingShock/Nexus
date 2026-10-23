// The Districts tool: start a district, drag on the map to paint it, and see its flag and name over the town.
// Two ways to pick tiles: a box, or a brush. The picked tiles are drawn on the map while you drag (render system select()).
// Sends newDistrict, paintDistrict, eraseDistrict, renameDistrict, shuffleDistrictName and deleteDistrict.
// Reads sim state, and the districts render system (scene.sys('districts').labels) for where the labels go.
import { inBounds, worldToTile, rectTiles, tileIndex, GRID_N, BASE } from '../../world/grid.js';
import { DISTRICT_COLORS, FLAG_STYLES, MAX_DISTRICTS, NAME_MAX, flagColor, discTiles, strokeTiles } from '../../world/districts.js';
import { $ } from '../format.js';
import { OBSTACLES, isBlocked } from '../label-fit.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ERASE = 'erase';

// The swatch: two colours in the flag's own split, so the list and the map match.
function swatch(d) {
  const a = flagColor(d), b = DISTRICT_COLORS[((d.pal || 0) + 3) % DISTRICT_COLORS.length];
  const bg = [
    `linear-gradient(90deg, ${a} 50%, ${b} 50%)`,
    `linear-gradient(${a} 50%, ${b} 50%)`,
    `linear-gradient(90deg, ${a} 0 38%, ${b} 38% 62%, ${a} 62%)`,
    `radial-gradient(circle, ${b} 0 26%, ${a} 28%)`,
  ][(d.style || 0) % FLAG_STYLES];
  return `<i class="dswatch" style="background:${bg}"></i>`;
}

export default {
  id: 'districts',
  create({ sim, send, scene }) {
    const stage = scene.canvas.parentElement;
    const tag = document.createElement('div');
    tag.className = 'ztag card'; tag.dataset.mo = 'tag'; tag.hidden = true;
    $('app').appendChild(tag);
    const layer = document.createElement('div');
    layer.className = 'dlayer';
    $('app').appendChild(layer);
    const labelEls = new Map();

    let active = false, brush = null, drag = null, sig = '';
    let mode = 'box', size = 1;       // 'box' | 'brush'; brush radius 0, 1 or 2 is S, M, L
    const RADIUS = [0, 1, 2];
    const view = () => scene.sys('districts');

    const state = () => sim.state;
    const find = (slot) => state().districts.find((d) => d.slot === slot);
    const clampTile = (t) => [Math.max(0, Math.min(GRID_N - 1, t[0])), Math.max(0, Math.min(GRID_N - 1, t[1]))];
    function tileAt(e) {
      const p = scene.ground(e.clientX, e.clientY);
      if (!p) return null;
      const t = worldToTile(p.x, p.z);
      return drag ? clampTile(t) : inBounds(t[0], t[1]) ? t : null;
    }
    const isLand = (gx, gz) => sim.grid.baseAt(gx, gz) !== BASE.WATER;

    // ---- the selection on the map: tile indexes, drawn by the render system ----
    function tilesOfDrag() {
      if (mode === 'box') return rectTiles(drag.a, drag.b);
      return drag.pts;
    }
    function showSelection(hover) {
      const sys = view();
      if (!sys) return;
      const erase = brush === ERASE;
      const col = erase ? null : (find(brush) ? flagColor(find(brush)) : null);
      if (drag) {
        const idx = [];
        for (const [gx, gz] of tilesOfDrag()) if (erase || isLand(gx, gz)) idx.push(tileIndex(gx, gz));
        sys.select(idx, erase ? 2 : 1, col);
        return idx.length;
      }
      if (hover && brush !== null) {
        const tiles = mode === 'box' ? [hover] : discTiles(hover, RADIUS[size]);
        sys.select(tiles.filter(([gx, gz]) => erase || isLand(gx, gz)).map(([gx, gz]) => tileIndex(gx, gz)), 3, col);
      } else sys.clearSelect();
      return 0;
    }

    // ---- floating tag: how many tiles the selection holds, or the district under the cursor ----
    function showTag(e, text, bad) {
      tag.textContent = text; tag.hidden = false; tag.classList.toggle('bad', !!bad);
      const w = tag.offsetWidth, x = Math.min(e.clientX + 18, innerWidth - w - 12);
      tag.style.transform = `translate(${Math.max(8, x)}px, ${Math.min(e.clientY + 22, innerHeight - 70)}px)`;
    }
    function describe(e) {
      const n = showSelection(null);
      if (brush === ERASE) { showTag(e, n ? `Erase ${n}` : 'Nothing here'); return; }
      const d = find(brush);
      if (!d) { tag.hidden = true; return; }
      showTag(e, `${d.name} · ${n}`, !n);
    }
    function cancel() {
      drag = null; tag.hidden = true;
      showSelection(null);
    }

    // ---- pointer: capture on the stage, left button only; other buttons still pan ----
    const onDown = (e) => {
      if (!active || e.button !== 0 || brush === null) return;
      const t = tileAt(e);
      if (!t) return;
      e.stopPropagation(); e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      drag = { a: t, b: t, id: e.pointerId, last: t, seen: new Set(), pts: [] };
      if (mode === 'brush') addStroke(t, t);
      describe(e);
    };
    function addStroke(from, to) {
      for (const tt of strokeTiles(from, to, RADIUS[size])) {
        const k = tileIndex(tt[0], tt[1]);
        if (!drag.seen.has(k)) { drag.seen.add(k); drag.pts.push(tt); }
      }
    }
    const onMove = (e) => {
      if (!active) return;
      if (drag) {
        if (e.pointerId !== drag.id) return;
        e.stopPropagation();
        const t = tileAt(e);
        if (t) {
          drag.b = t;
          if (mode === 'brush') { addStroke(drag.last, t); drag.last = t; }
        }
        describe(e);
        return;
      }
      if (e.buttons & 6) return;
      const t = tileAt(e);
      showSelection(t);
      const slot = t ? sim.grid.districtAt(t[0], t[1]) : 0;
      const d = slot && find(slot);
      if (d) showTag(e, d.name); else tag.hidden = true;
    };
    const onUp = (e) => {
      if (!active || !drag || e.pointerId !== drag.id || e.button !== 0) return;
      e.stopPropagation();
      const d = drag; drag = null; tag.hidden = true;
      view() && view().clearSelect();
      const shape = mode === 'box' ? { a: d.a, b: d.b } : { tiles: d.pts };
      if (brush === ERASE) send({ type: 'eraseDistrict', ...shape });
      else if (find(brush)) send({ type: 'paintDistrict', slot: brush, ...shape });
    };
    const onLeave = () => { if (!drag) { tag.hidden = true; showSelection(null); } };
    const onKey = (e) => { if (active && drag && e.key === 'Escape') { e.stopPropagation(); cancel(); } };

    // ---- flyout ----
    function tileCounts() {
      const out = new Map();
      for (let i = 0; i < GRID_N * GRID_N; i++) { const s = sim.grid.district[i]; if (s) out.set(s, (out.get(s) || 0) + 1); }
      return out;
    }
    function countsText() {
      const tiles = tileCounts();
      for (const d of state().districts) {
        const el = document.querySelector(`[data-count="${d.slot}"]`);
        if (!el) continue;
        const t = tiles.get(d.slot) || 0;
        el.textContent = t ? `${t} tile${t === 1 ? '' : 's'}` : 'Empty';
      }
    }
    function signature() {
      return state().districts.map((d) => [d.slot, d.name, d.pal, d.style].join(':')).join('|') + '#' + brush + mode + size;
    }
    const ICON_DICE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3"/><circle cx="5.6" cy="5.6" r=".9" fill="currentColor"/><circle cx="10.4" cy="10.4" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/></svg>';
    const ICON_X = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    const ICON_BOX = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.4" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="1.5"/></svg>';
    const ICON_BRUSH = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 2.5l3 3-7 7-3-3z"/><path d="M5.5 9.5C3.5 10 3 12 2.5 15.5 6 15 8 14.5 8.5 12.5"/></svg>';
    const ICON_ERASER = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M7 15l-4-4 7.5-7.5 5 5L9 15z"/><path d="M6 8l5 5M9 15h6"/></svg>';
    function hintText() {
      if (!state().districts.length) return 'Start with a new district';
      if (brush === ERASE) return mode === 'box' ? 'Drag a box to erase' : 'Brush over tiles to erase';
      return mode === 'box' ? 'Drag a box to paint' : 'Brush over tiles to paint';
    }
    function renderFly() {
      const f = $('fly');
      f.hidden = false;
      f.classList.add('dfly');
      const list = state().districts;
      const rows = list.map((d) => `
        <li class="drow" data-slot="${d.slot}" aria-pressed="${brush === d.slot}">
          <button class="dpick" data-brush="${d.slot}" aria-label="Paint with ${esc(d.name)}">${swatch(d)}</button>
          <div class="dtext">
            <input class="dname" maxlength="${NAME_MAX}" value="${esc(d.name)}" aria-label="District name">
            <small data-count="${d.slot}"></small>
          </div>
          <button class="dicon" data-shuffle="${d.slot}" title="New name, same flag" aria-label="New name">${ICON_DICE}</button>
          <button class="dicon" data-del="${d.slot}" title="Remove; its tiles stay as town" aria-label="Remove district">${ICON_X}</button>
        </li>`).join('');
      const full = list.length >= MAX_DISTRICTS;
      f.innerHTML = `<div class="head"><h3>Districts</h3><span>${hintText()}</span></div>
        <div class="dtools">
          <div class="dseg" role="group" aria-label="Selection">
            <button data-mode="box" aria-pressed="${mode === 'box'}" title="Drag a box">${ICON_BOX}<span>Box</span></button>
            <button data-mode="brush" aria-pressed="${mode === 'brush'}" title="Paint tiles freehand">${ICON_BRUSH}<span>Brush</span></button>
          </div>
          ${mode === 'brush' ? `<div class="dseg dsize" role="group" aria-label="Brush size">${['S', 'M', 'L'].map((l, k) => `<button data-size="${k}" aria-pressed="${size === k}" title="Brush size ${l}">${l}</button>`).join('')}</div>` : ''}
          <button class="dseg-erase" data-brush="${ERASE}" aria-pressed="${brush === ERASE}" title="Clear district paint; free">${ICON_ERASER}<span>Eraser</span></button>
        </div>
        ${list.length ? `<ul class="dlist">${rows}</ul>` : ''}
        <button class="btn primary dnew" id="dNew" ${full ? 'disabled' : ''}>${full ? 'All ' + MAX_DISTRICTS + ' named' : '+ New district'}</button>`;
      f.querySelectorAll('[data-brush]').forEach((b) => {
        b.onclick = () => { brush = b.dataset.brush === ERASE ? ERASE : Number(b.dataset.brush); syncFocus(); renderFly(); };
      });
      f.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { mode = b.dataset.mode; renderFly(); }; });
      f.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { size = Number(b.dataset.size); renderFly(); }; });
      f.querySelectorAll('.dname').forEach((input) => {
        const slot = Number(input.closest('.drow').dataset.slot);
        input.onchange = () => send({ type: 'renameDistrict', slot, name: input.value });
        input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
      });
      f.querySelectorAll('[data-shuffle]').forEach((b) => { b.onclick = () => send({ type: 'shuffleDistrictName', slot: Number(b.dataset.shuffle) }); });
      f.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => {
          const slot = Number(b.dataset.del);
          if (brush === slot) brush = null;
          send({ type: 'deleteDistrict', slot });
          syncFocus();
        };
      });
      const add = $('dNew');
      if (add) add.onclick = () => {
        send({ type: 'newDistrict' });
        const newest = state().districts[state().districts.length - 1];
        if (!newest) return;
        brush = newest.slot;
        syncFocus();
        renderFly();
        const input = document.querySelector(`.drow[data-slot="${newest.slot}"] .dname`);
        if (input) { input.focus(); input.select(); }
      };
      sig = signature();
      countsText();
    }
    const syncFocus = () => { const v = view(); if (v) v.focus(typeof brush === 'number' ? brush : 0); };

    // Rebuild the list only when its names, flags or choice change, so a name being typed is never replaced.
    function refresh() {
      if (!active) return;
      if (signature() !== sig) renderFly(); else countsText();
    }

    // ---- labels: DOM over the flags, placed from the render system's projection ----
    function placeLabels() {
      const sys = scene.sys('districts');
      if (!sys) return;
      const r = stage.getBoundingClientRect();
      const seen = new Set();
      for (const it of sys.labels(scene.camera)) {
        seen.add(it.slot);
        let el = labelEls.get(it.slot);
        const d = find(it.slot);
        if (!d) continue;
        if (!el) {
          el = document.createElement('div');
          el.className = 'dlabel';
          el.innerHTML = '<i></i><span></span>';
          layer.appendChild(el);
          labelEls.set(it.slot, el);
        }
        const name = d.name;
        if (el.dataset.name !== name) { el.dataset.name = name; el.lastChild.textContent = name; }
        el.querySelector('i').style.background = flagColor(d);
        el.hidden = !it.visible;
        if (it.visible) {
          const x = r.left + (it.nx + 1) / 2 * r.width, y = r.top + (1 - it.ny) / 2 * r.height;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 6px))`;
        }
      }
      for (const [slot, el] of labelEls) if (!seen.has(slot)) { el.remove(); labelEls.delete(slot); }
      const now = performance.now();
      if (now - fitAt > FIT_EVERY_MS) { fitAt = now; fitLabels(); }
    }
    // A label that would sit on the interface is hidden (visibility, so it keeps its place for the next check).
    // Obstacles are read a few times a second, not every frame.
    let fitAt = -Infinity;
    const FIT_EVERY_MS = 200;
    function fitLabels() {
      const shown = (el) => { const cs = getComputedStyle(el); return el.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; };
      const obstacles = [];
      for (const el of document.querySelectorAll(OBSTACLES.join(','))) {
        if (!layer.contains(el) && shown(el)) obstacles.push(el.getBoundingClientRect());
      }
      for (const el of labelEls.values()) {
        if (el.hidden) { el.classList.remove('blocked'); continue; }
        el.classList.toggle('blocked', isBlocked(el.getBoundingClientRect(), obstacles));
      }
    }

    // ---- tool on/off ----
    function enter() {
      active = true;
      if (brush === null && state().districts.length) brush = state().districts[0].slot;
      stage.classList.add('districts');
      stage.addEventListener('pointerdown', onDown, true);
      stage.addEventListener('pointermove', onMove, true);
      stage.addEventListener('pointerup', onUp, true);
      stage.addEventListener('pointerleave', onLeave);
      addEventListener('keydown', onKey, true);
      syncFocus();
      renderFly();
    }
    function leave() {
      active = false; drag = null; tag.hidden = true;
      const v = view(); if (v) { v.clearSelect(); v.focus(0); }
      removeEventListener('keydown', onKey, true);
      stage.classList.remove('districts');
      stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointermove', onMove, true);
      stage.removeEventListener('pointerup', onUp, true);
      stage.removeEventListener('pointerleave', onLeave);
      const f = $('fly');
      f.classList.remove('dfly');
      f.hidden = true;
    }

    return {
      onTool(t, was) {
        if (t === 'districts') enter();
        else if (was === 'districts') leave();
      },
      onEvent(e) { if (e.type === 'changed') refresh(); },
      frame() {
        placeLabels();
      },
    };
  },
};
