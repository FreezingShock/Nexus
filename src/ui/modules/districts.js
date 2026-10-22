// The Districts tool: start a district, drag on the map to paint it, and see its flag and name over the town.
// Sends newDistrict, paintDistrict, eraseDistrict, renameDistrict, shuffleDistrictName and deleteDistrict.
// Reads sim state, and the districts render system (scene.sys('districts').labels) for where the labels go.
import { inBounds, worldToTile, rectTiles, GRID_N, BASE } from '../../world/grid.js';
import { DISTRICT_COLORS, FLAG_STYLES, MAX_DISTRICTS, NAME_MAX, flagColor, lotsByDistrict } from '../../world/districts.js';
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

    const state = () => sim.state;
    const find = (slot) => state().districts.find((d) => d.slot === slot);
    const clampTile = (t) => [Math.max(0, Math.min(GRID_N - 1, t[0])), Math.max(0, Math.min(GRID_N - 1, t[1]))];
    function tileAt(e) {
      const p = scene.ground(e.clientX, e.clientY);
      if (!p) return null;
      const t = worldToTile(p.x, p.z);
      return drag ? clampTile(t) : inBounds(t[0], t[1]) ? t : null;
    }

    // ---- floating tag: the rectangle being painted, or the district under the cursor ----
    function showTag(e, text, bad) {
      tag.textContent = text; tag.hidden = false; tag.classList.toggle('bad', !!bad);
      const w = tag.offsetWidth, x = Math.min(e.clientX + 18, innerWidth - w - 12);
      tag.style.transform = `translate(${Math.max(8, x)}px, ${Math.min(e.clientY + 22, innerHeight - 70)}px)`;
    }
    function rectLand(a, b) {
      let n = 0;
      for (const [gx, gz] of rectTiles(a, b)) if (sim.grid.baseAt(gx, gz) !== BASE.WATER) n++;
      return n;
    }
    function describe(e) {
      if (drag) {
        const n = rectLand(drag.a, drag.b);
        if (brush === ERASE) { showTag(e, n ? `Erase · ${n} tile${n === 1 ? '' : 's'}` : 'Nothing to erase here'); return; }
        const d = find(brush);
        if (!d) { tag.hidden = true; return; }
        showTag(e, `${d.name} · ${n} tile${n === 1 ? '' : 's'}` + (n ? '' : ' · rivers keep their names'), !n);
        return;
      }
      tag.hidden = true;
    }

    // ---- pointer: capture on the stage, left button only; other buttons still pan ----
    const onDown = (e) => {
      if (!active || e.button !== 0 || brush === null) return;
      const t = tileAt(e);
      if (!t) return;
      e.stopPropagation(); e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      drag = { a: t, b: t, id: e.pointerId };
      describe(e);
    };
    const onMove = (e) => {
      if (!active) return;
      if (drag) {
        if (e.pointerId !== drag.id) return;
        e.stopPropagation();
        const t = tileAt(e);
        if (t) drag.b = t;
        describe(e);
        return;
      }
      if (e.buttons & 6) return;
      const t = tileAt(e);
      const slot = t ? sim.grid.districtAt(t[0], t[1]) : 0;
      const d = slot && find(slot);
      if (d) showTag(e, d.name); else tag.hidden = true;
    };
    const onUp = (e) => {
      if (!active || !drag || e.pointerId !== drag.id || e.button !== 0) return;
      e.stopPropagation();
      const d = drag; drag = null; tag.hidden = true;
      if (brush === ERASE) send({ type: 'eraseDistrict', a: d.a, b: d.b });
      else if (find(brush)) send({ type: 'paintDistrict', slot: brush, a: d.a, b: d.b });
    };
    const onLeave = () => { if (!drag) tag.hidden = true; };

    // ---- flyout ----
    function tileCounts() {
      const out = new Map();
      for (let i = 0; i < GRID_N * GRID_N; i++) { const s = sim.grid.district[i]; if (s) out.set(s, (out.get(s) || 0) + 1); }
      return out;
    }
    function countsText() {
      const tiles = tileCounts(), lots = lotsByDistrict(sim.grid.district, state().lots);
      for (const d of state().districts) {
        const el = document.querySelector(`[data-count="${d.slot}"]`);
        if (!el) continue;
        const t = tiles.get(d.slot) || 0, l = lots.get(d.slot) || 0;
        el.textContent = t ? `${t} tile${t === 1 ? '' : 's'} · ${l} building${l === 1 ? '' : 's'}` : 'No tiles yet. Drag on the map to paint it.';
      }
    }
    function signature() {
      return state().districts.map((d) => [d.slot, d.name, d.pal, d.style].join(':')).join('|') + '#' + brush;
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
          <button class="btn dsmall" data-shuffle="${d.slot}" title="A new name, same flag">Shuffle</button>
          <button class="btn dsmall" data-del="${d.slot}" title="Remove the district; its tiles stay as town">Remove</button>
        </li>`).join('');
      f.innerHTML = `<div class="head"><h3>Districts</h3><span>Name a neighbourhood, then drag on the map to paint it</span></div>
        <div class="drow-top">
          <button class="btn primary" id="dNew" ${list.length >= MAX_DISTRICTS ? 'disabled' : ''}>${list.length >= MAX_DISTRICTS ? 'All ' + MAX_DISTRICTS + ' named' : 'New district'}</button>
          <button class="btn dbtn" data-brush="${ERASE}" aria-pressed="${brush === ERASE}" title="Clears district paint; free">Eraser</button>
        </div>
        ${list.length ? `<ul class="dlist">${rows}</ul>` : '<p class="sub dhelp">Start a district and it gets a flag and a name over the town. Districts are free and never change what a building costs.</p>'}
        <p class="sub dhelp">Drag to paint a rectangle, click one tile at a time. Rivers keep their own names.</p>`;
      f.querySelectorAll('[data-brush]').forEach((b) => {
        b.onclick = () => { brush = b.dataset.brush === ERASE ? ERASE : Number(b.dataset.brush); renderFly(); };
      });
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
        };
      });
      const add = $('dNew');
      if (add) add.onclick = () => {
        send({ type: 'newDistrict' });
        const newest = state().districts[state().districts.length - 1];
        if (!newest) return;
        brush = newest.slot;
        renderFly();
        const input = document.querySelector(`.drow[data-slot="${newest.slot}"] .dname`);
        if (input) { input.focus(); input.select(); }
      };
      sig = signature();
      countsText();
    }
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
      renderFly();
    }
    function leave() {
      active = false; drag = null; tag.hidden = true;
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
