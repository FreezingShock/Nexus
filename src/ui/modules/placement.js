// Placing buildings: the Buildings and Services tools. Pick a model and a size, move the mouse to see a see-through
// preview on the grid (green fits, rose does not), click to place. V turns the building.
// This module only reads the sim and sends { type: 'place' }; the rules live in src/world/placement.js and the sim system.
import { CATEGORIES, canonicalDims, footprintsOf, modelById, modelsIn } from '../../world/models.js';
import { worldToTile } from '../../world/grid.js';
import { checkLot, problemText } from '../../world/placement.js';
import { fmt } from '../format.js';

const TOOLS = { build: 'Buildings', services: 'Services' };

export default {
  id: 'placement',
  create({ sim, send, scene, toast }) {
    const fly = document.getElementById('fly'), toolbar = document.getElementById('tools');
    const stage = scene.canvas.parentElement;
    const ui = { tool: null, cat: 'home', model: 'cottage', size: 0, rot: 0 };
    let hover = null, down = null, lastWarn = '';

    const ghost = () => scene.sys('placement-ghost');
    const cats = () => CATEGORIES.filter((c) => c.tool === ui.tool);
    const def = () => modelById(ui.model);
    const size = () => footprintsOf(def())[ui.size] || footprintsOf(def())[0];
    // the lot on the grid: the model's own dimensions, turned by `rot`
    function lotDims() {
      const [cw, cd] = canonicalDims(def(), size());
      return ui.rot % 2 ? [cd, cw] : [cw, cd];
    }

    // ---- flyout ----
    function pick(model) {
      ui.model = model; ui.size = 0;
      render(); refreshGhost();
    }
    function render() {
      const d = def(), c = cats();
      const sizes = footprintsOf(d), [a, b] = size();
      fly.innerHTML = `<div class="head"><h3>${TOOLS[ui.tool]}</h3><span>Pick one, then click the map · V turns it · Esc to stop</span></div>` +
        (c.length > 1 ? `<div class="ptabs">${c.map((x) => `<button class="tog" data-pcat="${x.id}" aria-pressed="${x.id === ui.cat}">${x.name}</button>`).join('')}</div>` : '') +
        `<div class="grid">${modelsIn(ui.cat).map((m) => `<button class="opt" data-pm="${m.id}" aria-pressed="${m.id === ui.model}"><b>${m.name}</b><small>${m.sub}</small><small><b style="color:var(--ink)">from ${m.cost} coins</b></small></button>`).join('')}</div>` +
        `<div class="lanes"><span class="sub" style="margin:0">Size</span>${sizes.map((s, i) => `<button class="tog" data-psize="${i}" aria-pressed="${i === ui.size}">${s[0]} × ${s[1]}</button>`).join('')}` +
        `<button class="tog" id="pturn" title="Turn the building (V)">Turn · V</button><span style="flex:1"></span><span class="sub" style="margin:0"><b style="color:var(--ink)">${fmt(sim.placeCost(d, a, b))} coins</b> for a ${a} × ${b} ${d.name.toLowerCase()}</span></div>`;
      fly.hidden = false;
    }
    fly.addEventListener('click', (e) => {
      if (!ui.tool) return;
      const t = e.target.closest('[data-pm],[data-pcat],[data-psize],#pturn');
      if (!t || !fly.contains(t)) return;
      e.stopPropagation();
      if (t.dataset.pm) pick(t.dataset.pm);
      else if (t.dataset.pcat) { ui.cat = t.dataset.pcat; pick(modelsIn(ui.cat)[0].id); }
      else if (t.dataset.psize !== undefined) { ui.size = Number(t.dataset.psize); render(); refreshGhost(); }
      else turn();
    }, true);

    function turn() { ui.rot = (ui.rot + 1) % 4; refreshGhost(); }

    // ---- ghost ----
    function lotAt(tile) {
      const [fw, fd] = lotDims();
      return { gx: tile[0] - Math.floor((fw - 1) / 2), gz: tile[1] - Math.floor((fd - 1) / 2), fw, fd };
    }
    function refreshGhost() {
      const g = ghost(); if (!g) return;
      if (!hover) { g.hide(); return; }
      const lot = lotAt(hover), r = checkLot(sim.grid, lot.gx, lot.gz, lot.fw, lot.fd);
      g.show({ id: 'b' + sim.state.nextPlaced, model: ui.model, ...lot, rot: ui.rot }, r.blocked);
    }
    function tileUnder(e) {
      const p = scene.ground(e.clientX, e.clientY);
      return p ? worldToTile(p.x, p.z) : null;
    }

    // ---- pointer (capture phase on the stage, button 0 only; right and middle drag still pan) ----
    const onMove = (e) => { hover = tileUnder(e); refreshGhost(); };
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      down = { x: e.clientX, y: e.clientY };
      hover = tileUnder(e); refreshGhost();
    };
    const onUp = (e) => {
      if (e.button !== 0 || !down) return;
      e.stopPropagation();
      const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y); down = null;
      const tile = tileUnder(e); if (!tile || moved > 12) return;
      const lot = lotAt(tile), r = checkLot(sim.grid, lot.gx, lot.gz, lot.fw, lot.fd);
      if (!r.ok) { const w = problemText(r.problem); if (w) toast(w); return; }
      send({ type: 'place', model: ui.model, ...lot, rot: ui.rot });
      hover = tile; refreshGhost();
    };
    const onLeave = () => { hover = null; down = null; refreshGhost(); };

    function activate(tool) {
      if (ui.tool === tool) return;
      const had = ui.tool;
      ui.tool = tool;
      if (!cats().some((c) => c.id === ui.cat)) { ui.cat = cats()[0].id; ui.model = modelsIn(ui.cat)[0].id; ui.size = 0; }
      render();
      if (!had) {
        stage.addEventListener('pointermove', onMove, true); stage.addEventListener('pointerdown', onDown, true);
        stage.addEventListener('pointerup', onUp, true); stage.addEventListener('pointerleave', onLeave);
      }
    }
    function deactivate() {
      if (!ui.tool) return;
      ui.tool = null; hover = null; down = null;
      stage.removeEventListener('pointermove', onMove, true); stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointerup', onUp, true); stage.removeEventListener('pointerleave', onLeave);
      const g = ghost(); if (g) g.hide();
    }
    // The toolbar owns which tool is active (aria-pressed). Follow it instead of editing ui.js.
    const follow = () => {
      const on = toolbar.querySelector('.tool[aria-pressed="true"]');
      const t = on && on.dataset.tool;
      if (t && TOOLS[t]) activate(t); else deactivate();
    };
    new MutationObserver(follow).observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

    return {
      onKey(e) { if (ui.tool && e.key.toLowerCase() === 'v') { turn(); return true; } return false; },
      onEvent(e) { if (e.type === 'placed' && lastWarn !== e.id) { lastWarn = e.id; refreshGhost(); } },
    };
  },
};
