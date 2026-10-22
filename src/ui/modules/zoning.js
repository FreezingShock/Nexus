// The Zones tool: pick a zone (or the eraser), drag a rectangle on the grid, release to paint.
// Reads sim state, sends paintZone / clearZone, and drives the tileview render system for the grid and the preview.
import { inBounds, worldToTile } from '../../world/grid.js';
import { demandCard } from '../hud-detail.js';
import { ZONE_DEFS } from '../../sim/zones.js';
import { $, fmt } from '../format.js';
import { zoneCard } from '../cards.js';


export default {
  id: 'zoning',
  create({ sim, send, scene, toast, tool }) {
    const view = () => scene.sys('tileview');
    const stage = scene.canvas.parentElement;
    const tag = document.createElement('div');
    tag.className = 'ztag card'; tag.hidden = true;
    $('app').appendChild(tag);
    // The demand widget sits in the top row of the HUD (index.html); this module fills its rows.
    const demandEl = document.getElementById('demandrows');
    paintDemand();

    let active = false, brush = 1, drag = null, hoverTile = null, last = null, flashed = false, acc = 0;

    const def = () => ZONE_DEFS[brush];
    const clampTile = (t) => [Math.max(0, Math.min(63, t[0])), Math.max(0, Math.min(63, t[1]))];
    function tileAt(e) {
      const p = scene.ground(e.clientX, e.clientY);
      if (!p) return null;
      const t = worldToTile(p.x, p.z);
      return drag ? clampTile(t) : inBounds(t[0], t[1]) ? t : null;
    }

    // ---- floating label ----
    function label(e, text, bad) {
      tag.textContent = text; tag.hidden = false; tag.classList.toggle('bad', !!bad);
      const w = tag.offsetWidth, x = Math.min(e.clientX + 18, innerWidth - w - 12);
      tag.style.transform = `translate(${Math.max(8, x)}px, ${Math.min(e.clientY + 22, innerHeight - 70)}px)`;
    }
    function describe(e) {
      if (drag) {
        const r = view().preview({ a: drag.a, b: drag.b, mode: brush ? 'paint' : 'erase', zone: brush });
        drag.result = r;
        if (!brush) return label(e, r.n ? `Erase · ${r.n} tile${r.n > 1 ? 's' : ''}` : 'Nothing painted here');
        if (!r.n) return label(e, r.blocked ? 'Only open ground can be zoned' : 'Already painted', !!r.blocked);
        const cost = sim.zoning.costOf(brush, r.n), poor = cost > sim.state.coins;
        label(e, `${def().name} · ${r.n} tile${r.n > 1 ? 's' : ''} · ${fmt(cost)} coins` + (r.blocked ? ` · ${r.blocked} blocked` : '') + (poor ? ' · not enough coins' : ''), poor);
      } else if (hoverTile) {
        view().hover(hoverTile, brush);
        const open = sim.grid.isOpen(hoverTile[0], hoverTile[1]);
        if (!brush) tag.hidden = true;
        else if (open) label(e, `${def().name} · ${def().cost} coins a tile`);
        else label(e, sim.grid.lotAt(hoverTile[0], hoverTile[1]) ? 'Building here' : 'Not open ground', true);
      } else { view().hover(null, brush); tag.hidden = true; }
    }

    // ---- pointer (capture phase on the stage, button 0 only; right and middle drag still pan) ----
    const onDown = (e) => {
      if (!active || e.button !== 0) return;
      const t = tileAt(e);
      if (!t) return;
      e.stopPropagation(); e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      drag = { a: t, b: t, id: e.pointerId, result: null };
      last = e; describe(e);
    };
    const onMove = (e) => {
      if (!active) return;
      last = e;
      if (drag) {
        if (e.pointerId !== drag.id) return;
        e.stopPropagation();
        const t = tileAt(e);
        if (t && (t[0] !== drag.b[0] || t[1] !== drag.b[1])) { drag.b = t; }
        describe(e);
      } else if (!(e.buttons & 6)) {
        const t = tileAt(e);
        if (!t || !hoverTile || t[0] !== hoverTile[0] || t[1] !== hoverTile[1] || tag.hidden) { hoverTile = t; }
        describe(e);
      }
    };
    const onUp = (e) => {
      if (!active || !drag || e.pointerId !== drag.id || e.button !== 0) return;
      e.stopPropagation();
      commit();
    };
    const onLeave = () => { if (!drag) { hoverTile = null; view().hover(null, brush); tag.hidden = true; } };
    function commit() {
      const d = drag; drag = null; tag.hidden = true;
      flashed = false;
      send(brush ? { type: 'paintZone', zone: brush, a: d.a, b: d.b } : { type: 'clearZone', a: d.a, b: d.b });
      if (!flashed) view().clearPreview();
      hoverTile = null;
    }
    function cancel() { drag = null; tag.hidden = true; view().clearPreview(); }

    // ---- flyout: a strip of zone tiles. Demand lives in the top widget, so the tiles stay small ----
    function renderFly() {
      const f = $('fly'), st = sim.zoning.stats(), n = sim.zoning.painted;
      f.hidden = false;
      f.classList.add('zfly');
      const tiles = ZONE_DEFS.slice(1).map((z, i) => zoneCard({ id: z.id, name: z.name, price: `${z.cost} coins a tile`, key: String(i + 1), pressed: brush === z.id, tip: z.sub })).join('') +
        zoneCard({ id: 0, name: 'Eraser', price: 'Free', key: '0', pressed: brush === 0, tip: 'Clears zones back to open ground' });
      f.innerHTML = `<div class="rhead"><b class="ptitle">Zones</b><span class="rhint">Drag on the map to paint · buildings grow near roads · ${n} tile${n === 1 ? '' : 's'} · ${st.count} building${st.count === 1 ? '' : 's'}</span></div>` +
        `<div class="strip zone-strip">${tiles}</div>`;
      f.querySelectorAll('[data-zone]').forEach((b) => { b.onclick = () => { setBrush(Number(b.dataset.zone)); }; });
    }
    function setBrush(z) {
      brush = z;
      document.querySelectorAll('#fly [data-zone]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.zone) === brush)));
      if (last) describe(last);
    }

    function enter() {
      active = true; view().showGrid(true); renderFly();
      stage.addEventListener('pointerdown', onDown, true);
      stage.addEventListener('pointermove', onMove, true);
      stage.addEventListener('pointerup', onUp, true);
      stage.addEventListener('pointerleave', onLeave);
      stage.classList.add('zoning');
    }
    function leave() {
      $('fly').classList.remove('zfly');
      active = false; drag = null; hoverTile = null; tag.hidden = true;
      view().showGrid(false); view().clearPreview();
      stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointermove', onMove, true);
      stage.removeEventListener('pointerup', onUp, true);
      stage.removeEventListener('pointerleave', onLeave);
      stage.classList.remove('zoning');
    }

    return {
      onTool(t, was) { if (t === 'zones') enter(); else if (was === 'zones') leave(); },
      onEvent(e) {
        if (e.type === 'zonePainted' || e.type === 'zoneCleared') { flashed = true; view().flash(); }
      },
      onKey(e) {
        if (!active) return false;
        if (e.key === 'Escape' && drag) { cancel(); return true; }
        if (/^[0-4]$/.test(e.key)) { setBrush(Number(e.key)); return true; }
        return false;
      },
      frame(dt) {
        acc += dt;
        if (acc > 1) { acc = 0; paintDemand(); }
      },
    };

    // The demand widget: one slim bar per zone with demand, in the zone colours. R, C and I, and a hover card with the
    // full names, the percentage and what drives each bar. The card text lives in hud-detail.js.
    const demandPop = document.getElementById('demandpop');
    let lastCard = '';
    function paintDemand() {
      if (!demandEl) return;
      const d = sim.zoning.demand();
      demandEl.innerHTML = [1, 2, 3].map((z) => {
        const pct = Math.round(d[z] * 100);
        return `<div class="drow2"><span class="dk" style="background:${ZONE_DEFS[z].paint}">${ZONE_DEFS[z].name[0]}</span>` +
          `<i class="dbar" aria-hidden="true"><u style="width:${pct}%;background:${ZONE_DEFS[z].paint}"></u></i><em>${pct}%</em></div>`;
      }).join('');
      if (demandPop) {
        const card = demandCard(d, sim.zoning.stats(), [null, ZONE_DEFS[1].paint, ZONE_DEFS[2].paint, ZONE_DEFS[3].paint]);
        if (card !== lastCard) { lastCard = card; demandPop.innerHTML = card; }
      }
    }
  },
};
