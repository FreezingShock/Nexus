// Placing buildings: the Buildings, Services and Parks tools. Pick a model and a size. Click the map to place one lot,
// or press and drag along a street to lay a row of them edge to edge. A small label follows the cursor with the price,
// or the reason a spot is refused, and a see-through preview shows every lot. V turns the building.
// A model with `free` sizes (the farm) is dragged as one rectangle of any size: the front stays put and the fields grow.
// Esc or right-click cancels a drag and keeps the tool; Esc with no drag leaves the tool, as before.
// This module only reads the sim and sends { type: 'place' } or { type: 'placeMany' }; the rules live in src/world/placement.js and the sim system.
import { CATEGORIES, areaCost, canonicalDims, floorsFor, footprintsOf, modelById, modelsIn } from '../../world/models.js';
import { worldToTile } from '../../world/grid.js';
import { checkLot, freeRect, frontRoadCount, frontRoadDistance, planPlacement, problemText, rowOrigins } from '../../world/placement.js';
import { buildCost, income } from '../../sim/economy.js';
import { $, fmt } from '../format.js';
import { thumbFor } from '../../render/thumbs.js';
import { bookmarkTabs, coins, detailText, effectOf, esc, tileCard } from '../cards.js';

const TOOLS = { build: 'Buildings', services: 'Services', parks: 'Parks' };
const COIN = '<i class="coin"></i>';

export default {
  id: 'placement',
  create({ sim, send, scene, toast }) {
    const fly = document.getElementById('fly'), toolbar = document.getElementById('tools');
    const stage = scene.canvas.parentElement;
    const tag = document.createElement('div');
    tag.id = 'placelabel'; tag.dataset.mo = 'tag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true');
    $('app').appendChild(tag);
    // auto: the turn follows the street (until V is pressed); rot: the player's own turn, used when no street is near
    const ui = { tool: null, cat: 'home', model: 'cottage', size: 0, rot: 0, auto: true };
    let hover = null, drag = null, pointer = { x: 0, y: 0 }, dirty = false, ticker = 0;

    const ghost = () => scene.sys('placement-ghost');
    const cats = () => CATEGORIES.filter((c) => c.tool === ui.tool);
    const def = () => modelById(ui.model);
    const size = () => footprintsOf(def())[ui.size] || footprintsOf(def())[0];
    // the lot on the grid: the model's own dimensions, turned by `rot`
    function lotDims(rot = ui.rot) {
      const [cw, cd] = canonicalDims(def(), size());
      return rot % 2 ? [cd, cw] : [cw, cd];
    }

    // ---- flyout ----
    function pick(model) {
      ui.model = model; ui.size = 0; ui.auto = true;
      render(); dirty = true;
    }
    // The compact strip: category icons, one tile per model with its real price at the chosen size, and a slim footer
    // with the size, turn, what the selected model is and what it costs. Tiles keep data-pm; the services module reads it.
    const picOf = (id) => { const url = thumbFor(id); return url ? `<img src="${url}" alt="" width="96" height="72" decoding="async">` : '<span class="pic-ph"></span>'; };
    const footprintOf = (m) => { const s = footprintsOf(m); return s[Math.min(ui.size, s.length - 1)]; };
    const modelPrice = (m) => { const [a, b] = footprintOf(m); return sim.placeCost(m, a, b); };
    function render() {
      const d = def(), c = cats();
      const sizes = footprintsOf(d), [a, b] = size();
      const tabs = c.length > 1 ? bookmarkTabs(c, ui.cat, 'data-pcat') : '';
      const tiles = modelsIn(ui.cat).map((m) => tileCard({
        pic: picOf(m.id), title: m.name, price: coins(modelPrice(m)), short: sim.state.coins < modelPrice(m),
        tip: m.sub + (effectOf(m) ? ' · ' + effectOf(m) : ''), pressed: m.id === ui.model, data: { pm: m.id },
      })).join('');
      fly.innerHTML = `<div class="pbar">${tabs}<div class="strip">${tiles}</div></div>` +
        `<div class="pfoot"><b class="ptitle">${TOOLS[ui.tool]}</b>` +
        (d.free ? `<span class="psize hint">Drag to size</span>` : `<span class="psize" role="group" aria-label="Size">${sizes.map((s, i) => `<button type="button" class="tog" data-psize="${i}" aria-pressed="${i === ui.size}">${s[0]} × ${s[1]}</button>`).join('')}</span>`) +
        `<button type="button" class="tog" id="pturn" title="Turn the building (V)">Turn · V</button>` +
        `<span class="pdetail" title="${esc(detailText(d))}">${esc(detailText(d))}</span>` +
        `<b class="pprice">${coins(sim.placeCost(d, a, b))}</b></div>`;
      fly.hidden = false;
    }
    fly.addEventListener('click', (e) => {
      if (!ui.tool) return;
      const t = e.target.closest('[data-pm],[data-pcat],[data-psize],#pturn');
      if (!t || !fly.contains(t)) return;
      e.stopPropagation();
      if (t.dataset.pm) pick(t.dataset.pm);
      else if (t.dataset.pcat) { ui.cat = t.dataset.pcat; pick(modelsIn(ui.cat)[0].id); }
      else if (t.dataset.psize !== undefined) { ui.size = Number(t.dataset.psize); render(); dirty = true; }
      else turn();
    }, true);

    function turn() { ui.rot = (ui.rot + 1) % 4; ui.auto = false; dirty = true; }

    // The turn a new building takes at `tile`: the one whose front faces the most road. Ties keep the player's turn.
    // Once V has been pressed, the turn is the player's own.
    function turnFor(tile) {
      if (!ui.auto) return ui.rot;
      let best = ui.rot, score = 0;
      for (let k = 0; k < 4; k++) {
        const r = (ui.rot + k) % 4;
        const [fw, fd] = lotDims(r);
        const plan = planPlacement({ model: ui.model, gx: tile[0] - Math.floor((fw - 1) / 2), gz: tile[1] - Math.floor((fd - 1) / 2), fw, fd, rot: r });
        if (plan.error) return ui.rot;
        const s = frontRoadCount(sim.grid, plan.gx, plan.gz, plan.fw, plan.fd, plan.rot);
        if (s > score) { score = s; best = plan.rot; }
      }
      return best;
    }

    // ---- what a click or a drag would place ----
    // The lots from tile `start` to tile `end` at turn `rot`, each planned and checked the way the sim will do it.
    // A free-size model is one rectangle from `start` to `end`, grown to its smallest size and held to its largest.
    // The start tile is a corner of the lot (see freeRect), so the edge you began on stays put. A click gives the smallest farm, laid out the way the turn wants it, so all four turns show.
    // The front faces the nearest road (until V is pressed): the turn whose front edge has a road closest straight out.
    // Turns that would leave the house too shallow are skipped; with no road in reach the player's own turn stands.
    function freeLot(start, end) {
      const hi = def().free.min[1];
      const lotFor = (r) => ({ ...freeRect(sim.grid, def(), start, end, r), rot: r });
      let best = lotFor(ui.rot);
      if (ui.auto) {
        let near = Infinity;
        for (let k = 0; k < 4; k++) {
          const lot = lotFor((ui.rot + k) % 4);
          if ((lot.rot % 2 ? lot.fw : lot.fd) < hi) continue;
          const dist = frontRoadDistance(sim.grid, lot.gx, lot.gz, lot.fw, lot.fd, lot.rot);
          if (dist < near) { near = dist; best = lot; }
        }
      }
      return best;
    }
    function lotsFor(start, end, rot) {
      if (def().free) {
        const { rot: r, ...lot } = freeLot(start, end);
        const plan = planPlacement({ model: ui.model, ...lot, rot: r });
        if (plan.error) return [];
        const check = checkLot(sim.grid, plan.gx, plan.gz, plan.fw, plan.fd, plan.def);
        return [{ lot, plan, rot: plan.rot, ok: check.ok, blocked: check.blocked, problem: check.problem }];
      }
      const [fw, fd] = lotDims(rot);
      const out = [];
      for (const [gx, gz] of rowOrigins(start, end, fw, fd)) {
        const lot = { gx, gz, fw, fd };
        const plan = planPlacement({ model: ui.model, ...lot, rot });
        if (plan.error) continue;
        const check = checkLot(sim.grid, plan.gx, plan.gz, plan.fw, plan.fd, plan.def);
        out.push({ lot, plan, rot: plan.rot, ok: check.ok, blocked: check.blocked, problem: check.problem });
      }
      return out;
    }
    // Price of the lots that can be built, in order: each one raises the next, as the sim charges them.
    function priceOf(lots) {
      let total = 0, count = 0;
      const owned = sim.ownedCount();
      for (const l of lots) if (l.ok) { total += buildCost(areaCost(l.plan.def, l.plan.fw, l.plan.fd), owned + count); count++; }
      return { total, count };
    }

    // ---- the ghost and the label ----
    function say(html, cls = '') {
      tag.className = cls; tag.innerHTML = html; tag.hidden = false;
      const w = tag.offsetWidth, h = tag.offsetHeight;
      tag.style.transform = `translate(${Math.round(Math.max(8, Math.min(pointer.x + 18, innerWidth - w - 12)))}px,${Math.round(Math.min(pointer.y + 22, innerHeight - h - 12))}px)`;
    }
    function label(lots) {
      if (!lots.length) { tag.hidden = true; return; }
      const d = def(), dragging = !!drag;
      const { total, count } = priceOf(lots);
      const poor = count > 0 && total > sim.state.coins;
      const need = poor ? `<small class="need">need ₵ ${fmt(total - sim.state.coins)} more</small>` : '';
      if (lots.length === 1) {
        const l = lots[0];
        if (!l.ok) return say(problemText(l.problem) || 'Nothing can go here', 'bad');
        if (d.free) {
          const area = l.plan.fw * l.plan.fd, earn = income(floorsFor(d, area), 1);
          return say(`${COIN}<b>−₵ ${fmt(total)}</b><small>${d.name} · ${l.plan.fw} × ${l.plan.fd} tiles · earns ${earn}/s${dragging ? '' : ' · drag to size'}</small>` + need, poor ? 'poor' : '');
        }
        return say(`${COIN}<b>${dragging ? '−' : ''}₵ ${fmt(total)}</b><small>${d.name}</small>` + need, poor ? 'poor' : '');
      }
      if (!count) return say(problemText(lots[0].problem) || 'Nothing fits along that line', 'bad');
      const blocked = lots.length - count;
      return say(`${COIN}<b>−₵ ${fmt(total)}</b><small>${count} × ${d.name}</small>` +
        (blocked ? `<small>${blocked} ${blocked === 1 ? 'spot' : 'spots'} blocked</small>` : '') + need, poor ? 'poor' : '');
    }
    // Redraws the ghost and the label for what the pointer covers now. Runs at most once per frame.
    function refresh() {
      dirty = false;
      const g = ghost();
      if (!ui.tool || (!hover && !drag)) { if (g) g.hide(); tag.hidden = true; return; }
      const lots = drag ? lotsFor(drag.start, drag.cur, drag.rot) : lotsFor(hover, hover, turnFor(hover));
      if (g) {
        const next = sim.state.nextPlaced;
        g.showMany(lots.map((l) => ({ rec: { id: 'b' + next, model: ui.model, gx: l.plan.gx, gz: l.plan.gz, fw: l.plan.fw, fd: l.plan.fd, rot: l.plan.rot }, blocked: l.blocked })));
      }
      label(lots);
    }

    // ---- pointer (capture phase on the stage, button 0 only; right and middle drag still pan) ----
    const tileUnder = (e) => { const p = scene.ground(e.clientX, e.clientY); return p ? worldToTile(p.x, p.z) : null; };
    const look = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
    function onMove(e) {
      look(e);
      const t = tileUnder(e);
      hover = t;
      if (drag && t) drag.cur = t;
      dirty = true;
    }
    function onDown(e) {
      if (e.button === 2 && drag) { // right-click cancels the drag and keeps the tool; the scene never sees it
        e.stopPropagation(); e.preventDefault();
        drag = null; dirty = true; return;
      }
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      look(e);
      const t = tileUnder(e);
      if (!t) return;
      drag = { start: t, cur: t, id: e.pointerId, rot: turnFor(t) };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      hover = t; dirty = true;
    }
    function onUp(e) {
      if (e.button !== 0 || !drag || e.pointerId !== drag.id) return;
      e.stopPropagation();
      const d = drag; drag = null; dirty = true;
      look(e);
      const lots = lotsFor(d.start, tileUnder(e) || d.cur, d.rot);
      if (!lots.length) return;
      const ok = lots.filter((l) => l.ok);
      if (!ok.length) { const w = problemText(lots[0].problem); if (w) toast(w); return; }
      if (lots.length === 1) send({ type: 'place', model: ui.model, ...ok[0].lot, rot: ok[0].rot });
      else send({ type: 'placeMany', items: ok.map((l) => ({ model: ui.model, ...l.lot, rot: l.rot })) });
    }
    const onLeave = () => { if (!drag) { hover = null; dirty = true; } };

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
      dirty = true;
    }
    function deactivate() {
      if (!ui.tool) return;
      ui.tool = null; hover = null; drag = null; dirty = false;
      stage.removeEventListener('pointermove', onMove, true); stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointerup', onUp, true); stage.removeEventListener('pointerleave', onLeave);
      const g = ghost(); if (g) g.hide();
      tag.hidden = true;
    }
    // The toolbar owns which tool is active (aria-pressed). Follow it instead of editing ui.js.
    const follow = () => {
      const on = toolbar.querySelector('.tool[aria-pressed="true"]');
      const t = on && on.dataset.tool;
      if (t && TOOLS[t]) activate(t); else deactivate();
    };
    new MutationObserver(follow).observe(toolbar, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

    return {
      onKey(e) {
        if (!ui.tool) return false;
        if (e.key.toLowerCase() === 'v') { turn(); return true; }
        if (e.key === 'Escape' && drag) { drag = null; dirty = true; return true; }
        return false;
      },
      onEvent(e) {
        if (e.type === 'placed' || e.type === 'bulldozed' || e.type === 'changed') dirty = true; // the next lot id and the price moved
      },
      // Runs the pointer's updates once per frame, not once per mouse event. The label's coin figures refresh twice a second.
      frame(dt) {
        if (!ui.tool) return;
        ticker += dt; if (ticker > 0.5) { ticker = 0; dirty = true; }
        if (dirty) refresh();
      },
    };
  },
};
