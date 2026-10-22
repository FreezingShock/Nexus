// The road tool: click-to-click routes on the shared grid, bulldozing roads, undo. A route is a chain of pivots, each
// joined to the next by an L (a straight line with Shift). Space adds a pivot, L flips the bend, Esc or right-click
// steps back one pivot. Routes are checked by the grid rules in src/world/roadnet.js (validateRoute), so the preview
// and the sim always agree.
// Pointer handling follows docs/GRID.md: capture-phase listeners on the stage while the tool is active, button 0 only,
// so right and middle drag still pan and the wheel still zooms.
import { ROAD_TYPES } from '../../sim/catalog.js';
import { inBounds, tileIndex, worldToTile } from '../../world/grid.js';
import { BLOCK_TEXT, chooseRoute, planStroke, roadBlock } from '../../world/roadnet.js';
import { $, fmt } from '../format.js';
import { roadSwatch, tileCard } from '../cards.js';
import { playCue } from '../../audio/cuehub.js';

const costOf = (id) => ROAD_TYPES.find((r) => r.id === id).cost;
const BLUE = 0x8FB8D6, RED = 0xE3A08E, TERRA = 0xB8472E, GOLD = 0xE6BC62;
// The drawing keys. src/ui/shortcuts.js lists them with the file and literal the sheet checks.
const PIVOT_KEY = ' ', FLIP_KEY = 'l';
const PAINT_LAYERS = ['hover', 'start', 'pivot', 'join', 'bad'];
const near = (a, b) => a[0] === b[0] && a[1] === b[1];
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export default {
  id: 'road-tool',
  create({ sim, send, scene, toast, tool }) {
    const state = sim.state;
    const stage = scene.canvas.parentElement, canvas = scene.canvas;
    // anchor: the last committed tile, where the next segment starts. pivots: corners added while drawing this segment.
    let type = 'two', anchor = null, pivots = [], erase = null, hover = null, shift = false, flip = false, pointer = { x: 0, y: 0 };
    let lastKey = '', rev = 0, lastRoads = state.roads, previewLen = 0;
    const label = document.createElement('div');
    label.id = 'roadlabel'; label.hidden = true; label.setAttribute('aria-hidden', 'true');
    $('app').appendChild(label);

    const drawing = () => tool() === 'roads', erasing = () => tool() === 'bulldoze';
    const overlay = () => scene.sys('grid-overlay'), roadsView = () => scene.sys('roads');
    const blockAt = (gx, gz) => roadBlock(sim.grid, sim.layout, state, gx, gz);
    const isRoad = (t) => state.roads[tileIndex(t[0], t[1])] !== undefined;
    const unlocked = (r) => !r.unlockParts || state.roadUnlocks.includes(r.id);
    const tileAt = (e) => {
      const g = scene.ground(e.clientX, e.clientY);
      if (!g) return null;
      const t = worldToTile(g.x, g.z);
      return inBounds(t[0], t[1]) ? t : null;
    };
    // The route through the points: anchor, each pivot, then the cursor. The auto-pick chooses each L's bend.
    const routeFor = (points) => chooseRoute({ points, straight: shift, flip, roads: state.roads, blockedBy: blockAt });
    const routeNow = () => (anchor && hover ? routeFor([anchor, ...pivots, hover]) : null);
    const evaluate = (route) => planStroke({ path: route.path, type, roads: state.roads, blockedBy: blockAt, costOf });
    const claim = (e) => { e.stopPropagation(); e.preventDefault(); };

    // ---- the label that follows the pointer ----
    function say(html, cls = '') {
      label.className = cls; label.innerHTML = html; label.hidden = false;
      const w = label.offsetWidth, h = label.offsetHeight;
      label.style.transform = `translate(${Math.round(Math.min(pointer.x + 18, innerWidth - w - 12))}px,${Math.round(Math.min(pointer.y + 22, innerHeight - h - 12))}px)`;
    }
    const coin = '<i class="coin"></i>';
    const short = () => ROAD_TYPES.find((r) => r.id === type).short;
    const paint = (grid, name, tiles, opts) => grid.paint(name, tiles, opts);

    // ---- preview: ghost road, tile highlights, label ----
    function refresh(force) {
      const grid = overlay(), rv = roadsView();
      if (!grid || !rv) return;
      if (!drawing() && !erasing()) { clearView(); return; }
      if (state.roads !== lastRoads) { lastRoads = state.roads; rev++; }
      const route = drawing() ? routeNow() : null;
      const key = [drawing() ? type : 'x', route ? route.path.map((p) => p[0] + ',' + p[1]).join(';') : '', hover ? hover.join(',') : '',
        pivots.length, erase ? erase.tiles.size : 0, rev, anchor ? anchor.join(',') : '', flip ? 1 : 0, shift ? 1 : 0].join('|');
      if (!force && key === lastKey) return;
      lastKey = key;

      if (erasing()) {
        const tiles = erase ? [...erase.tiles.values()] : (hover && isRoad(hover) ? [hover] : []);
        paint(grid, 'hover', tiles.map((t) => [t[0], t[1], RED]), { opacity: 0.55, outline: true });
        for (const n of PAINT_LAYERS.filter((n) => n !== 'hover')) paint(grid, n, []);
        rv.clearPreview();
        if (!tiles.length) { label.hidden = true; return; }
        let back = 0; for (const t of tiles) back += Math.floor(state.roads[tileIndex(t[0], t[1])].p / 2);
        say(`${coin}<b>+₵ ${fmt(back)}</b><small>${tiles.length} ${tiles.length === 1 ? 'road' : 'roads'} back</small><em>Bulldoze</em>`);
        return;
      }

      if (!route) {
        // no start yet: the tile under the cursor, and whether a road could start there
        for (const n of PAINT_LAYERS.filter((n) => n !== 'hover')) paint(grid, n, []);
        rv.clearPreview();
        previewLen = 0;
        if (!hover) { paint(grid, 'hover', []); label.hidden = true; return; }
        const why = blockAt(hover[0], hover[1]);
        paint(grid, 'hover', [[hover[0], hover[1], why ? RED : BLUE]], { opacity: 0.5, outline: true });
        if (why) say(BLOCK_TEXT[why], 'bad');
        else say(`${coin}<b>₵ ${costOf(type)}</b><small>per tile</small><em>${short()}</em><small>Click to start</small>`);
        return;
      }

      const plan = evaluate(route), bad = plan.problems.length > 0;
      rv.preview({ key, tiles: plan.tiles.map((e) => ({ gx: e.gx, gz: e.gz, t: e.t, d: e.d })), bad });
      // One soft tick for each tile the route gained since the last look (the engine rate-limits long routes).
      const grew = plan.tiles.length - previewLen;
      previewLen = plan.tiles.length;
      if (grew > 0) playCue('road-grow', { n: plan.tiles.length });
      paint(grid, 'bad', plan.problems.map((p) => [p.at[0], p.at[1], RED]), { opacity: 0.6, outline: true });
      paint(grid, 'start', [[anchor[0], anchor[1], TERRA]], { opacity: 0.55, outline: true });
      paint(grid, 'pivot', pivots.map((p) => [p[0], p[1], GOLD]), { opacity: 0.8, outline: true });
      const joins = plan.joins.filter((t) => !near(t, anchor));
      paint(grid, 'join', joins.map((t) => [t[0], t[1], BLUE]), { opacity: 0.5, outline: true });
      const onCursor = plan.problems.some((p) => near(p.at, hover));
      paint(grid, 'hover', [[hover[0], hover[1], onCursor ? RED : BLUE]], { opacity: 0.4, outline: true });

      const first = plan.problems[0];
      if (first) { say(BLOCK_TEXT[first.reason], 'bad'); return; }
      if (!plan.tiles.length) { say(`<b>Already a street</b><small>${plan.length} tiles</small><em>${short()}</em><small>Move the cursor off the road</small>`); return; }
      const poor = state.coins < plan.cost;
      const notes = [
        pivots.length ? `${pivots.length} ${pivots.length === 1 ? 'pivot' : 'pivots'}` : '',
        shift ? 'straight' : flip ? 'bend flipped' : '',
        joins.length ? 'joins a road' : '',
      ].filter(Boolean).map((s) => `<small>${s}</small>`).join('');
      say(`${coin}<b>−₵ ${fmt(plan.cost)}</b><small>${plan.length} ${plan.length === 1 ? 'tile' : 'tiles'}</small><em>${short()}</em>${notes}` +
        (poor ? `<small class="need">need ₵ ${fmt(plan.cost - state.coins)} more</small>` : ''), poor ? 'poor' : '');
    }
    function clearView() {
      const grid = overlay(), rv = roadsView();
      if (grid) for (const n of PAINT_LAYERS) grid.paint(n, []);
      if (rv) rv.clearPreview();
      label.hidden = true; lastKey = '';
    }
    // Drops the pivot, then the start, then nothing. Returns false when there was nothing to step back from.
    function stepBack() {
      if (pivots.length) { pivots = pivots.slice(0, -1); return true; }
      if (anchor) { anchor = null; return true; }
      return false;
    }
    function cancel() { anchor = null; pivots = []; erase = null; refresh(true); }

    // ---- committing ----
    // Commits one segment (one undo step). Returns false when the route is refused, true when the anchor may move.
    function commit(route) {
      const plan = evaluate(route);
      if (plan.problems.length) { toast(BLOCK_TEXT[plan.problems[0].reason]); return false; }
      if (!plan.tiles.length) return true;
      if (state.coins < plan.cost) { toast('Not enough coins yet: need ' + fmt(plan.cost - state.coins) + ' more'); return false; }
      send({ type: 'drawRoad', roadType: type, path: route.path });
      return true;
    }
    // Space: a pivot at the cursor, or on the route nearest the cursor, after the last pivot.
    function addPivot() {
      if (!anchor || !hover) return false;
      const route = routeFor([anchor, ...pivots, hover]);
      const from = route.stops[route.stops.length - 2], to = route.stops[route.stops.length - 1];
      let best = -1;
      for (let i = from + 1; i <= to; i++) if (best < 0 || manhattan(route.path[i], hover) < manhattan(route.path[best], hover)) best = i;
      if (best < 0) return false;
      pivots = [...pivots, route.path[best]];
      return true;
    }

    // ---- pointer ----
    function onDown(e) {
      if (e.button === 2 && (anchor || erase)) { claim(e); if (erase) erase = null; else stepBack(); refresh(true); return; }
      if (e.button !== 0) return;
      const t = tileAt(e); if (!t) return;
      if (drawing()) {
        claim(e);
        hover = t;
        if (!anchor) {
          const why = blockAt(t[0], t[1]);
          if (why) { toast(BLOCK_TEXT[why]); return; }
          anchor = t; pivots = []; refresh(true); return;
        }
        const route = routeFor([anchor, ...pivots, t]);
        if (commit(route)) { anchor = route.path[route.path.length - 1]; pivots = []; }
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
      if (t && erase && isRoad(t)) erase.tiles.set(tileIndex(t[0], t[1]), t);
      refresh();
      if (!label.hidden) say(label.innerHTML, label.className);
    }
    function onUp(e) {
      if (e.button !== 0) return;
      document.body.classList.remove('no-select');
      if (erase) {
        const tiles = [...erase.tiles.values()];
        erase = null;
        send({ type: 'bulldozeRoad', tiles });
        refresh(true);
      }
    }
    for (const [n, fn] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp]]) stage.addEventListener(n, fn, true);
    stage.addEventListener('pointercancel', () => { if (erase) cancel(); }, true);
    stage.addEventListener('pointerleave', () => { hover = null; label.hidden = true; refresh(); });
    addEventListener('keyup', (e) => { if (e.key === 'Shift') { shift = false; refresh(true); } });
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !(e.target.closest && e.target.closest('input,textarea,select'))) { e.preventDefault(); send({ type: 'undo' }); }
    });

    // ---- flyout ----
    function renderFlyout() {
      const f = $('fly');
      const tiles = ROAD_TYPES.map((r, i) => {
        const open = unlocked(r);
        return tileCard({
          pic: roadSwatch(r.id), title: r.name, tip: r.sub,
          price: open ? `${r.cost} a tile` : '', unlock: open ? '' : `Unlock · ${fmt(r.unlockParts)} Parts`,
          key: String(i + 1), locked: !open, pressed: type === r.id, data: { road: r.id },
        });
      }).join('');
      f.innerHTML = `<div class="rhead"><b class="ptitle">Roads</b><span class="rhint">Click, move, click · Space adds a pivot · L flips the bend · Shift straight · Esc steps back</span><button class="btn" id="undoRoad">Undo</button><button class="btn primary" id="doneRoad">Done</button></div><div class="strip road-strip">${tiles}</div>`;
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
      $('undoRoad').onclick = () => send({ type: 'undo' }); // the last thing done, road or building
      $('doneRoad').onclick = () => { cancel(); document.querySelector('.tool[data-tool="roads"]').click(); };
    }

    return {
      onTool(t, was) {
        if (was === 'roads' || was === 'bulldoze') { anchor = null; pivots = []; erase = null; }
        canvas.classList.toggle('pencil', t === 'roads');
        if (t !== 'roads') $('fly').classList.remove('road-fly');
        const g = overlay(); if (g) g.show(t === 'roads' || t === 'bulldoze');
        if (t === 'roads') renderFlyout();
        refresh(true);
      },
      onEvent(e) {
        if (e.type === 'roadsChanged') { lastRoads = null; refresh(true); }
        if (e.type === 'changed' && drawing() && !$('fly').hidden) renderFlyout();
      },
      onKey(e) {
        if (e.key === 'Shift') { shift = true; refresh(true); return false; }
        if (erasing()) {
          if (e.key === 'Escape' && erase) { erase = null; refresh(true); return true; }
          return false;
        }
        if (!drawing()) return false;
        if (e.key === 'Escape') { if (stepBack()) { refresh(true); return true; } return false; }
        if (e.key === PIVOT_KEY) { e.preventDefault(); if (!e.repeat && addPivot()) refresh(true); return true; }
        if (e.key.toLowerCase() === FLIP_KEY) { flip = !flip; refresh(true); return true; }
        if (/^[1-5]$/.test(e.key)) {
          const r = ROAD_TYPES[Number(e.key) - 1];
          if (r && unlocked(r)) { type = r.id; renderFlyout(); refresh(true); return true; }
        }
        return false;
      },
    };
  },
};
