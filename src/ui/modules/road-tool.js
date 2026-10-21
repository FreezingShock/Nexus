// The road tool: pencil strokes on the shared grid, click-to-click lines, a live cost label, bulldozing roads, undo.
// Pointer handling follows docs/GRID.md: capture-phase listeners on the stage while the tool is active, button 0 only,
// so right and middle drag still pan and the wheel still zooms.
import { ROAD_TYPES } from '../../sim/catalog.js';
import { inBounds, tileIndex, worldToTile } from '../../world/grid.js';
import { BLOCK_TEXT, elbowPath, extendStroke, planStroke, roadBlock, rulerPath } from '../../world/roadnet.js';
import { $, fmt } from '../format.js';

const ICON = {
  two: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="9" width="120" height="20" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="5" fill="#DDD3C0" stroke="#2B2620"/><rect x="0" y="29" width="120" height="4" fill="#DDD3C0" stroke="#2B2620"/><line x1="0" y1="19" x2="120" y2="19" stroke="#FAF3E4" stroke-width="2" stroke-dasharray="8 6"/></svg>',
  bike: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="6" fill="#A8C179" stroke="#2B2620"/><rect x="0" y="24" width="120" height="6" fill="#A8C179" stroke="#2B2620"/><line x1="0" y1="17" x2="120" y2="17" stroke="#FAF3E4" stroke-width="2" stroke-dasharray="8 6"/></svg>',
  one: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><path d="M16 17H46M38 11L46 17L38 23M64 17H94M86 11L94 17L86 23" stroke="#FAF3E4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  bus: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="8" fill="#EBD9A0" stroke="#2B2620"/><rect x="0" y="22" width="120" height="8" fill="#EBD9A0" stroke="#2B2620"/></svg>',
  free: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#6F685A" stroke="#2B2620" stroke-width="1.5"/><line x1="0" y1="15" x2="120" y2="15" stroke="#2B2620" stroke-width="2"/><line x1="0" y1="19" x2="120" y2="19" stroke="#2B2620" stroke-width="2"/></svg>',
};
const costOf = (id) => ROAD_TYPES.find((r) => r.id === id).cost;
const BLUE = 0x8FB8D6, RED = 0xE3A08E, TERRA = 0xB8472E;

export default {
  id: 'road-tool',
  create({ sim, send, scene, toast, tool }) {
    const state = sim.state;
    const stage = scene.canvas.parentElement, canvas = scene.canvas;
    let type = 'two', anchor = null, stroke = null, erase = null, hover = null, shift = false, pointer = { x: 0, y: 0 };
    let lastKey = '', rev = 0, lastRoads = state.roads;
    const label = document.createElement('div');
    label.id = 'roadlabel'; label.hidden = true; label.setAttribute('aria-hidden', 'true');
    $('app').appendChild(label);

    const drawing = () => tool() === 'roads', erasing = () => tool() === 'bulldoze';
    const overlay = () => scene.sys('grid-overlay'), roadsView = () => scene.sys('roads');
    const blockOf = (t) => roadBlock(sim.grid, sim.layout, state, t[0], t[1]);
    const isRoad = (t) => state.roads[tileIndex(t[0], t[1])] !== undefined;
    const unlocked = (r) => !r.unlockParts || state.roadUnlocks.includes(r.id);
    const tileAt = (e) => {
      const g = scene.ground(e.clientX, e.clientY);
      if (!g) return null;
      const t = worldToTile(g.x, g.z);
      return inBounds(t[0], t[1]) ? t : null;
    };
    const evaluate = (path) => planStroke({ path, type, roads: state.roads, canRoad: (gx, gz) => !blockOf([gx, gz]), costOf });
    const claim = (e) => { e.stopPropagation(); e.preventDefault(); };

    // ---- the label that follows the pencil ----
    function say(html, cls = '') {
      label.className = cls; label.innerHTML = html; label.hidden = false;
      const w = label.offsetWidth, h = label.offsetHeight;
      label.style.transform = `translate(${Math.round(Math.min(pointer.x + 18, innerWidth - w - 12))}px,${Math.round(Math.min(pointer.y + 22, innerHeight - h - 12))}px)`;
    }
    const coin = '<i class="coin"></i>';
    const short = () => ROAD_TYPES.find((r) => r.id === type).short;

    // ---- preview: ghost road, tile highlights, label ----
    function currentPath() {
      if (stroke && stroke.down) return stroke.path;
      if (anchor && hover) return shift ? rulerPath(anchor, hover) : elbowPath(anchor, hover);
      return null;
    }
    function refresh(force) {
      const grid = overlay(), rv = roadsView();
      if (!grid || !rv) return;
      if (!drawing() && !erasing()) { clearView(); return; }
      if (state.roads !== lastRoads) { lastRoads = state.roads; rev++; }
      const path = drawing() ? currentPath() : null;
      const key = (drawing() ? type : 'x') + '|' + (path ? path.map((p) => p[0] + ',' + p[1]).join(';') : '') + '|' + (hover ? hover.join(',') : '') + '|' + (erase ? erase.tiles.size : 0) + '|' + rev + '|' + (anchor || '') + '|' + (stroke && stroke.blocked || '');
      if (!force && key === lastKey) return;
      lastKey = key;

      if (erasing()) {
        const tiles = erase ? [...erase.tiles.values()] : (hover && isRoad(hover) ? [hover] : []);
        grid.paint('hover', tiles.map((t) => [t[0], t[1], RED]), { opacity: 0.55, outline: true });
        grid.paint('start', []); grid.paint('bad', []); rv.clearPreview();
        if (!tiles.length) { label.hidden = true; return; }
        let back = 0; for (const t of tiles) back += Math.floor(state.roads[tileIndex(t[0], t[1])].p / 2);
        say(`${coin}<b>+₵ ${fmt(back)}</b><small>${tiles.length} ${tiles.length === 1 ? 'road' : 'roads'} back</small><em>Bulldoze</em>`);
        return;
      }

      if (!path) {
        // hovering with the pencil up
        grid.paint('start', []); grid.paint('bad', []); rv.clearPreview();
        if (!hover) { grid.paint('hover', []); label.hidden = true; return; }
        const why = blockOf(hover);
        grid.paint('hover', [[hover[0], hover[1], why ? RED : BLUE]], { opacity: 0.5, outline: true });
        if (why) say(BLOCK_TEXT[why], 'bad'); else say(`${coin}<b>₵ ${costOf(type)}</b><small>per tile</small><em>${short()}</em>`);
        return;
      }

      const plan = evaluate(path), bad = plan.blocked.length > 0;
      rv.preview({ key, tiles: plan.tiles.map((e) => ({ gx: e.gx, gz: e.gz, t: e.t, d: e.d })), bad });
      grid.paint('bad', plan.blocked.map((t) => [t[0], t[1], RED]), { opacity: 0.6, outline: true });
      const head = path[0];
      grid.paint('start', [[head[0], head[1], TERRA]], { opacity: 0.55, outline: true });
      grid.paint('hover', hover && !plan.blocked.some((t) => t[0] === hover[0] && t[1] === hover[1]) ? [[hover[0], hover[1], BLUE]] : [], { opacity: 0.4, outline: true });
      if (bad) { say(BLOCK_TEXT[blockOf(plan.blocked[0])], 'bad'); return; }
      if (stroke && stroke.blocked) { say(BLOCK_TEXT[blockOf(stroke.blocked)], 'bad'); return; }
      if (!plan.tiles.length) { say(`<b>Already there</b><small>${plan.length} tiles</small><em>${short()}</em>`); return; }
      const short_ = state.coins < plan.cost;
      say(`${coin}<b>−₵ ${fmt(plan.cost)}</b><small>${plan.length} ${plan.length === 1 ? 'tile' : 'tiles'}</small><em>${short()}</em>` + (short_ ? `<small class="need">need ₵ ${fmt(plan.cost - state.coins)} more</small>` : ''), short_ ? 'poor' : '');
    }
    function clearView() {
      const grid = overlay(), rv = roadsView();
      if (grid) for (const n of ['hover', 'start', 'bad']) grid.paint(n, []);
      if (rv) rv.clearPreview();
      label.hidden = true; lastKey = '';
    }
    function cancel() { anchor = null; stroke = null; erase = null; refresh(true); }

    // ---- committing ----
    function commit(path) {
      const plan = evaluate(path);
      if (plan.blocked.length) { toast(BLOCK_TEXT[blockOf(plan.blocked[0])]); return false; }
      if (!plan.tiles.length) return false;
      if (state.coins < plan.cost) { toast('Not enough coins yet: need ' + fmt(plan.cost - state.coins) + ' more'); return false; }
      send({ type: 'drawRoad', roadType: type, path });
      return true;
    }

    // ---- pointer ----
    function onDown(e) {
      if (e.button === 2 && (anchor || stroke)) { claim(e); cancel(); return; }
      if (e.button !== 0) return;
      const t = tileAt(e); if (!t) return;
      if (drawing()) {
        claim(e); document.body.classList.add('no-select');
        try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        if (anchor) {
          const path = shift ? rulerPath(anchor, t) : elbowPath(anchor, t);
          if (commit(path)) anchor = path[path.length - 1];
          refresh(true); return;
        }
        stroke = { path: [t], down: true, start: t, blocked: blockOf(t) ? t : null };
        if (stroke.blocked) { toast(BLOCK_TEXT[blockOf(t)]); stroke = null; }
        refresh(true);
      } else if (erasing() && isRoad(t)) {
        claim(e); document.body.classList.add('no-select');
        try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        erase = { tiles: new Map([[tileIndex(t[0], t[1]), t]]) };
        refresh(true);
      }
    }
    function onMove(e) {
      pointer = { x: e.clientX, y: e.clientY };
      if (!drawing() && !erasing()) return;
      const t = tileAt(e);
      hover = t;
      if (t && stroke && stroke.down) {
        if (shift) { stroke.path = rulerPath(stroke.start, t); stroke.blocked = null; }
        else {
          const r = extendStroke(stroke.path, t, (n) => !blockOf(n));
          stroke.path = r.path; stroke.blocked = r.blocked;
        }
      } else if (t && erase && isRoad(t)) erase.tiles.set(tileIndex(t[0], t[1]), t);
      refresh();
      if (!label.hidden) say(label.innerHTML, label.className);
    }
    function onUp(e) {
      if (e.button !== 0) return;
      document.body.classList.remove('no-select');
      if (stroke && stroke.down) {
        const path = stroke.path;
        stroke = null;
        if (path.length > 1) commit(path);
        else anchor = path[0]; // a plain click starts a line: move, then click where it should end
        refresh(true);
      } else if (erase) {
        const tiles = [...erase.tiles.values()];
        erase = null;
        send({ type: 'bulldozeRoad', tiles });
        refresh(true);
      }
    }
    for (const [n, fn] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp]]) stage.addEventListener(n, fn, true);
    stage.addEventListener('pointercancel', () => { if (stroke || erase) cancel(); }, true);
    stage.addEventListener('pointerleave', () => { hover = null; label.hidden = true; refresh(); });
    addEventListener('keyup', (e) => { if (e.key === 'Shift') { shift = false; refresh(true); } });
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !(e.target.closest && e.target.closest('input,textarea,select'))) { e.preventDefault(); send({ type: 'undoRoad' }); }
    });

    // ---- flyout ----
    function renderFlyout() {
      const f = $('fly');
      const cards = ROAD_TYPES.map((r) => {
        const open = unlocked(r);
        return `<button class="opt${open ? '' : ' locked'}" data-road="${r.id}" aria-pressed="${type === r.id}">${ICON[r.id]}<b>${r.name}</b><small>${r.sub}</small>` +
          (open ? `<small><b style="color:var(--ink)">${r.cost} coins</b> per tile</small>` : `<small><b style="color:var(--action)">Unlock · ${fmt(r.unlockParts)} Parts</b></small>`) + '</button>';
      }).join('');
      f.innerHTML = `<div class="head"><h3>Roads</h3><span>Drag to draw · click twice for a line · Shift keeps it straight · draw over a road to upgrade it · Esc stops · Ctrl+Z undoes</span><button class="btn" id="undoRoad">Undo</button><button class="btn primary" id="doneRoad">Done</button></div><div class="grid">${cards}</div>`;
      f.hidden = false; f.classList.add('road-fly');
      f.querySelectorAll('[data-road]').forEach((b) => {
        b.onclick = () => {
          const r = ROAD_TYPES.find((x) => x.id === b.dataset.road);
          if (!unlocked(r)) {
            if (state.parts >= r.unlockParts) send({ type: 'unlockRoad', roadType: r.id });
            else toast('Needs ' + fmt(r.unlockParts) + ' Parts to unlock (you have ' + fmt(Math.floor(state.parts)) + ')');
            return;
          }
          type = r.id; renderFlyout(); refresh(true);
        };
      });
      $('undoRoad').onclick = () => send({ type: 'undoRoad' });
      $('doneRoad').onclick = () => { cancel(); document.querySelector('.tool[data-tool="roads"]').click(); };
    }

    return {
      onTool(t, was) {
        const on = t === 'roads' || t === 'bulldoze';
        if (was === 'roads' || was === 'bulldoze') { anchor = null; stroke = null; erase = null; }
        canvas.classList.toggle('pencil', t === 'roads');
        if (t !== 'roads') $('fly').classList.remove('road-fly');
        const g = overlay(); if (g) g.show(on);
        if (t === 'roads') renderFlyout();
        refresh(true);
      },
      onEvent(e) {
        if (e.type === 'roadsChanged') { lastRoads = null; refresh(true); }
        if (e.type === 'changed' && drawing() && !$('fly').hidden) renderFlyout();
      },
      onKey(e) {
        if (e.key === 'Shift') { shift = true; refresh(true); return false; }
        if (e.key === 'Escape' && (anchor || stroke || erase)) { cancel(); return true; }
        if (drawing() && /^[1-5]$/.test(e.key)) {
          const r = ROAD_TYPES[Number(e.key) - 1];
          if (r && unlocked(r)) { type = r.id; renderFlyout(); refresh(true); return true; }
        }
        return false;
      },
    };
  },
};
