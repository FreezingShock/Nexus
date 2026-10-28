// The Decor tool (Y): pick a decoration, click a free tile to place one, or drag to dress a whole patch. Pick the broom
// to clear pieces the same way. Rarer kinds show their Parts price on the tile; one click spends it for good, then Coins buy each copy.
// A see-through preview shows every tile (green fits, red does not), and a label follows the cursor with the price or the reason.
// Reads the sim and sends placeDecor, clearDecor and unlockDecor. Rules and prices live in src/world/decor.js and src/sim/systems/decor.js.
import { DECOR_CATS, MAX_DECOR, MAX_DRAG, decorById, decorCost, decorIn, decorRefund, isOpen, offSale, problemAt, problemText, takenSet } from '../../world/decor.js';
import { rectTiles, worldToTile } from '../../world/grid.js';
import { $, fmt } from '../format.js';
import { bookmarkTabs, coins, paintFly, esc, tileCard } from '../cards.js';
import { decorThumb } from '../../render/thumbs.js';

const COIN = '<i class="coin"></i>';
const ERASE = 'erase';
const P = 'fill="none" stroke="#2B2620" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
// Small ink drawings for the tiles. 60 x 44 boxes, one per kind.
const PIC = {
  hedge: `<rect x="8" y="16" width="44" height="18" rx="7" fill="#7BA25C" ${P}/><circle cx="18" cy="16" r="6" fill="#8FB86C" ${P}/><circle cx="32" cy="14" r="7" fill="#8FB86C" ${P}/><circle cx="44" cy="16" r="6" fill="#8FB86C" ${P}/>`,
  bench: `<rect x="12" y="14" width="36" height="7" fill="#B98558" ${P}/><rect x="12" y="24" width="36" height="6" fill="#B98558" ${P}/><path d="M16 30V38M44 30V38" ${P}/>`,
  flowers: `<rect x="8" y="26" width="44" height="12" rx="3" fill="#8A6A52" ${P}/><circle cx="18" cy="22" r="5" fill="#E88CA6" ${P}/><circle cx="30" cy="19" r="5" fill="#F2D27A" ${P}/><circle cx="42" cy="22" r="5" fill="#FAF3E4" ${P}/>`,
  lamp: `<path d="M30 40V16" ${P}/><rect x="24" y="6" width="12" height="12" rx="2" fill="#F2D27A" ${P}/><path d="M24 40H36" ${P}/>`,
  topiary: `<rect x="22" y="30" width="16" height="10" fill="#C96F4F" ${P}/><circle cx="30" cy="22" r="9" fill="#6E9C55" ${P}/><circle cx="30" cy="11" r="5" fill="#8FB86C" ${P}/>`,
  stall: `<path d="M10 14H50L46 24H14Z" fill="#C96F4F" ${P}/><path d="M16 24V38M44 24V38" ${P}/><rect x="14" y="32" width="32" height="6" fill="#B98558" ${P}/>`,
  fountain: `<path d="M10 34H50L46 40H14Z" fill="#CFC7B6" ${P}/><path d="M30 34V18" ${P}/><path d="M30 18C24 18 22 24 20 28M30 18C36 18 38 24 40 28" ${P}/><ellipse cx="30" cy="34" rx="16" ry="3" fill="#8FC4D8" ${P}/>`,
  statue: `<rect x="20" y="30" width="20" height="9" fill="#CFC7B6" ${P}/><path d="M30 30V18" ${P}/><circle cx="30" cy="12" r="5" fill="#7A9A8A" ${P}/><path d="M22 20H38" ${P}/>`,
  gazebo: `<path d="M8 18L30 6L52 18Z" fill="#C96F4F" ${P}/><path d="M14 18V38M30 18V38M46 18V38" ${P}/><path d="M10 38H50" ${P}/>`,
};
// The real model, drawn once off screen like the Buildings menu; the hand-drawn icon stands in when there is no WebGL.
const pic = (k) => { const url = decorThumb(k); return url ? `<img src="${url}" alt="" width="96" height="72" decoding="async">` : `<svg viewBox="0 0 60 44" aria-hidden="true">${PIC[k]}</svg>`; };
const BROOM = `<svg viewBox="0 0 24 24" aria-hidden="true" ${P}><path d="M14 4L10 12"/><path d="M6 13L12 12L17 16L14 21H4Z" fill="#E6BC62"/></svg>`;

export default {
  id: 'decor',
  create({ sim, send, scene, toast }) {
    const fly = $('fly');
    const stage = scene.canvas.parentElement;
    const tag = document.createElement('div');
    tag.id = 'decorlabel'; tag.dataset.mo = 'tag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true');
    $('app').appendChild(tag);

    let on = false, cat = 'greenery', kind = 'hedge', rot = 0, hover = null, drag = null, pointer = { x: 0, y: 0 }, dirty = false, ticker = 0;
    const erasing = () => kind === ERASE;
    const view = () => scene.sys('decor');

    // ---- flyout ----
    const owned = () => sim.state.decor.length;
    function tiles() {
      const cards = decorIn(cat).map((d) => {
        const open = isOpen(d, sim.state.decorUnlocks), price = decorCost(d, owned()), shut = offSale(d, sim.state);
        if (shut) return tileCard({ pic: pic(d.id), title: d.name, tip: d.sub + ' · ' + shut, price: '', unlock: d.keepsake ? 'Keepsake' : 'Seasonal', locked: true, short: true, pressed: false, data: { dk: d.id } });
        return tileCard({
          pic: pic(d.id), title: d.name, tip: d.sub + (open ? '' : ' · ' + d.parts + ' Parts opens it for good'),
          price: open ? coins(price) : '', unlock: open ? '' : d.parts + ' Parts', locked: !open, short: open ? sim.state.coins < price : sim.state.parts < d.parts,
          pressed: kind === d.id, data: { dk: d.id },
        });
      });
      cards.push(tileCard({ pic: BROOM, title: 'Clear', tip: 'Click or drag to clear decorations · half the price comes back', price: 'half back', pressed: erasing(), data: { dk: ERASE }, cls: 'erase' }));
      return cards.join('');
    }
    // What the tiles show right now; the flyout is redrawn only when this changes, so the strip keeps its scroll.
    const sigOf = () => cat + '|' + kind + '|' + owned() + '|' + sim.state.decorUnlocks.join() + '|' + sim.state.event + (sim.state.keepsakes || []).join() + '|' + decorIn(cat).map((d) => (isOpen(d, sim.state.decorUnlocks) ? sim.state.coins < decorCost(d, owned()) : sim.state.parts < d.parts) ? 1 : 0).join('');
    let flySig = '';
    function render(swap = false) {
      flySig = sigOf();
      const d = decorById(kind);
      const detail = erasing() ? 'Click or drag over decorations to clear them' : d.sub;
      const foot = `<b class="ptitle">${esc(DECOR_CATS.find((c) => c.id === cat).name)}</b>` +
        `<button type="button" class="tog" id="dturn" title="Turn the piece (V)">Turn · V</button>` +
        `<span class="pdetail" title="${esc(detail)}">${esc(detail)}</span>` +
        `<span class="dhint">${owned()} placed</span>`;
      paintFly(fly, 'd', { tabs: bookmarkTabs(DECOR_CATS, cat, 'data-dcat'), strip: tiles(), foot, attr: 'data-dcat', active: cat }, swap);
      fly.hidden = false;
    }
    fly.addEventListener('click', (e) => {
      if (!on) return;
      const t = e.target.closest('[data-dk],[data-dcat],#dturn');
      if (!t || !fly.contains(t)) return;
      e.stopPropagation();
      if (t.id === 'dturn') { turn(); return; }
      if (t.dataset.dcat) { cat = t.dataset.dcat; if (!erasing()) kind = decorIn(cat)[0].id; render(true); dirty = true; return; }
      const k = t.dataset.dk;
      const def = decorById(k);
      const shut = def && offSale(def, sim.state);
      if (shut) { toast(shut); return; }
      if (def && !isOpen(def, sim.state.decorUnlocks)) { send({ type: 'unlockDecor', k }); if (sim.state.parts >= def.parts) kind = k; render(); return; }
      kind = k; render(); dirty = true;
    }, true);
    function turn() { rot = (rot + 1) % 4; dirty = true; }

    // ---- what a click or a drag would do ----
    const tileUnder = (e) => { const p = scene.ground(e.clientX, e.clientY); return p ? worldToTile(p.x, p.z) : null; };
    function tilesFor(a, b) {
      const all = rectTiles(a, b);
      return all.length > MAX_DRAG ? all.slice(0, MAX_DRAG) : all;
    }
    function plan() {
      const a = drag ? drag.start : hover, b = drag ? drag.cur : hover;
      if (!a || !b) return null;
      const list = tilesFor(a, b);
      if (erasing()) {
        const hit = list.filter(([gx, gz]) => sim.decorAt(gx, gz));
        return { erase: true, tiles: list, hit };
      }
      const def = decorById(kind), taken = takenSet(sim.state.decor);
      let cost = 0, count = 0, first = null;
      const items = list.map(([gx, gz]) => {
        const problem = problemAt(sim.grid, gx, gz, taken) || (owned() + count >= MAX_DECOR ? 'full' : null);
        if (problem) { if (!first) first = problem; return { k: kind, gx, gz, rot, ok: false }; }
        cost += decorCost(def, owned() + count); count++;
        return { k: kind, gx, gz, rot, ok: true };
      });
      return { erase: false, def, items, cost, count, problem: first };
    }

    // ---- preview and label ----
    function say(html, cls = '') {
      tag.className = cls; tag.innerHTML = html; tag.hidden = false;
      const w = tag.offsetWidth, h = tag.offsetHeight;
      tag.style.transform = `translate(${Math.round(Math.max(8, Math.min(pointer.x + 18, innerWidth - w - 12)))}px,${Math.round(Math.min(pointer.y + 22, innerHeight - h - 12))}px)`;
    }
    function refresh() {
      dirty = false;
      const v = view();
      if (!on || (!hover && !drag)) { if (v) v.clearPreview(); tag.hidden = true; return; }
      const p = plan();
      if (!p) { if (v) v.clearPreview(); tag.hidden = true; return; }
      if (p.erase) {
        if (v) v.clearPreview();
        if (!p.hit.length) { tag.hidden = true; return; }
        const back = p.hit.reduce((n, [gx, gz]) => n + decorRefund(decorById(sim.decorAt(gx, gz).k)), 0);
        say(`${COIN}<b>+₵ ${fmt(back)}</b><small>clear ${p.hit.length}</small>`);
        return;
      }
      if (v) v.preview(p.items);
      if (!p.count) { say(problemText(p.problem) || (p.problem === 'full' ? 'The town is full of decorations' : 'Nothing fits here'), 'bad'); return; }
      const poor = p.cost > sim.state.coins;
      say(`${COIN}<b>${drag ? '−' : ''}₵ ${fmt(p.cost)}</b><small>${p.count > 1 ? p.count + ' × ' : ''}${p.def.name}</small>` +
        (poor ? `<small class="need">need ₵ ${fmt(p.cost - sim.state.coins)} more</small>` : ''), poor ? 'poor' : '');
    }

    // ---- pointer (capture phase on the stage, button 0 only; right and middle drag still pan) ----
    function onMove(e) {
      pointer = { x: e.clientX, y: e.clientY };
      hover = tileUnder(e);
      if (drag && hover) drag.cur = hover;
      dirty = true;
    }
    function onDown(e) {
      if (e.button === 2 && drag) { e.stopPropagation(); e.preventDefault(); drag = null; dirty = true; return; }
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      pointer = { x: e.clientX, y: e.clientY };
      const t = tileUnder(e);
      if (!t) return;
      drag = { start: t, cur: t, id: e.pointerId };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      hover = t; dirty = true;
    }
    function onUp(e) {
      if (e.button !== 0 || !drag || e.pointerId !== drag.id) return;
      e.stopPropagation();
      drag.cur = tileUnder(e) || drag.cur;
      const p = plan();
      drag = null; dirty = true;
      if (!p) return;
      if (p.erase) { if (p.hit.length) send({ type: 'clearDecor', tiles: p.hit }); return; }
      const ok = p.items.filter((i) => i.ok);
      send({ type: 'placeDecor', items: (ok.length ? ok : p.items.slice(0, 1)).map(({ k, gx, gz, rot: r }) => ({ k, gx, gz, rot: r })) });
    }
    const onLeave = () => { if (!drag) { hover = null; dirty = true; } };

    function activate() {
      if (on) return;
      on = true; render();
      stage.addEventListener('pointermove', onMove, true); stage.addEventListener('pointerdown', onDown, true);
      stage.addEventListener('pointerup', onUp, true); stage.addEventListener('pointerleave', onLeave);
      dirty = true;
    }
    function deactivate() {
      if (!on) return;
      on = false; hover = null; drag = null; dirty = false;
      stage.removeEventListener('pointermove', onMove, true); stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointerup', onUp, true); stage.removeEventListener('pointerleave', onLeave);
      const v = view(); if (v) v.clearPreview();
      tag.hidden = true;
    }

    return {
      onTool(t) { if (t === 'decor') activate(); else deactivate(); },
      onKey(e) {
        if (!on) return false;
        if (e.key.toLowerCase() === 'v') { turn(); return true; }
        if (e.key === 'Escape' && drag) { drag = null; dirty = true; return true; }
        return false;
      },
      onEvent(e) {
        if (on && (e.type === 'decorPlaced' || e.type === 'decorCleared' || e.type === 'changed')) dirty = true;
      },
      // Pointer updates run once per frame; the label's coin figures and the tiles' short marks refresh twice a second.
      frame(dt) {
        if (!on) return;
        ticker += dt; if (ticker > 0.5) { ticker = 0; dirty = true; }
        if (dirty) { if (sigOf() !== flySig) render(); refresh(); }
      },
    };
  },
};
