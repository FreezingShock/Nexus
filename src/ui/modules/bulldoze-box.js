// Bulldoze box: hold Shift with the Bulldoze tool and drag a rectangle. Everything inside is tinted red, a label shows what
// goes and what comes back, and letting go clears it as one undo step. A big box (a dozen buildings or more, or lots of
// coins back) asks first. Plain clicks, sweeps and camera drags are left alone.
import { rectTiles, worldToTile, inBounds } from '../../world/grid.js';
import { scanArea } from '../../world/bulldoze-area.js';
import { starterProtected } from '../../world/starter.js';
import { $, fmt } from '../format.js';

const PROTECTED = starterProtected();
const RED = 0xE3A08E, GOLD = 0xE6BC62, CAP = 1600;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export default {
  id: 'bulldoze-box',
  order: -5, // before the sweep and the road tool, so a Shift press is ours first
  create({ sim, send, scene, tool, toast }) {
    const state = sim.state, stage = scene.canvas.parentElement, canvas = scene.canvas;
    let box = null, ask = null, pointer = { x: 0, y: 0 };
    const label = document.createElement('div');
    label.id = 'dozelabel'; label.dataset.mo = 'tag'; label.hidden = true; label.setAttribute('aria-hidden', 'true');
    $('app').appendChild(label);
    const card = document.createElement('div');
    card.id = 'dozeask'; card.dataset.mo = 'card'; card.hidden = true; card.setAttribute('role', 'alertdialog');
    $('app').appendChild(card);

    const overlay = () => scene.sys('grid-overlay');
    const tileAt = (e) => {
      const g = scene.ground(e.clientX, e.clientY);
      if (!g) return null;
      const t = worldToTile(g.x, g.z);
      return inBounds(t[0], t[1]) ? t : null;
    };
    const place = (el, x, y) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.transform = `translate(${Math.round(Math.max(8, Math.min(x, innerWidth - w - 12)))}px,${Math.round(Math.max(8, Math.min(y, innerHeight - h - 12)))}px)`;
    };
    const scan = () => scanArea(state, sim.grid, box.a, box.b, PROTECTED);
    const summary = (s) => [s.count && plural(s.count, 'building', 'buildings'), s.roads.length && plural(s.roads.length, 'road', 'roads'),
      s.trees.length && plural(s.trees.length, 'tree', 'trees'), !s.count && s.zones && plural(s.zones, 'zoned tile', 'zoned tiles')].filter(Boolean);

    function paint(s) {
      const g = overlay(); if (!g) return;
      g.paint('dozebox', box ? rectTiles(box.a, box.b).slice(0, CAP).map(([x, z]) => [x, z, GOLD]) : [], { opacity: 0.22, outline: true });
      g.paint('dozehit', s ? s.hit.slice(0, CAP).map(([x, z]) => [x, z, RED]) : [], { opacity: 0.6 });
    }
    function show() {
      if (!box) return;
      const s = scan();
      paint(s);
      if (s.empty) { label.className = ''; label.innerHTML = '<b>Nothing here</b><em>Bulldoze box</em>'; }
      else {
        const parts = summary(s).map((t) => `<small>${t}</small>`).join('');
        label.className = '';
        label.innerHTML = `<i class="coin"></i><b>${s.refund ? '+₵ ' + fmt(s.refund) : 'Clear'}</b>${parts}<em>${s.asks ? 'Will ask first' : 'Bulldoze box'}</em>`;
      }
      label.hidden = false; place(label, pointer.x + 18, pointer.y + 22);
    }
    function clear() {
      box = null; ask = null; label.hidden = true; card.hidden = true;
      document.body.classList.remove('no-select');
      paint(null);
    }
    function confirm() {
      if (!ask) return;
      send({ type: 'bulldozeArea', a: ask.a, b: ask.b });
      clear();
    }
    function openAsk(s) {
      ask = { a: box.a, b: box.b };
      const what = summary(s).join(' and ');
      card.innerHTML = `<b class="ptitle">Clear ${what}?</b>` +
        `<p>${s.refund ? `₵ ${fmt(s.refund)} comes back from the roads. ` : ''}Buildings give nothing back. Ctrl+Z puts everything back.</p>` +
        `<div class="row"><button class="btn" id="dozeKeep">Keep</button><button class="btn primary" id="dozeGo">Clear</button></div>`;
      card.hidden = false; place(card, pointer.x - 120, pointer.y + 18);
      label.hidden = true; box = null;
      $('dozeKeep').onclick = clear; $('dozeGo').onclick = confirm;
      $('dozeGo').focus();
    }

    function onDown(e) {
      if (ask) { if (!card.contains(e.target)) clear(); return; }
      if (e.button === 2 && box) { e.stopImmediatePropagation(); e.preventDefault(); clear(); return; }
      if (e.button !== 0 || tool() !== 'bulldoze' || !e.shiftKey) return;
      const t = tileAt(e); if (!t) return;
      e.stopImmediatePropagation(); e.preventDefault();
      box = { a: t, b: t, pointer: e.pointerId };
      pointer = { x: e.clientX, y: e.clientY };
      document.body.classList.add('no-select');
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      show();
    }
    function onMove(e) {
      pointer = { x: e.clientX, y: e.clientY };
      if (!box || e.pointerId !== box.pointer) return;
      e.stopImmediatePropagation();
      const t = tileAt(e);
      if (t) box.b = t;
      show();
    }
    function onUp(e) {
      if (!box || e.pointerId !== box.pointer || e.button !== 0) return;
      e.stopImmediatePropagation();
      const s = scan();
      if (s.empty) { toast('Nothing to clear there'); clear(); return; }
      if (s.asks) { openAsk(s); return; }
      send({ type: 'bulldozeArea', a: box.a, b: box.b });
      clear();
    }
    stage.addEventListener('pointerdown', onDown, true);
    stage.addEventListener('pointermove', onMove, true);
    stage.addEventListener('pointerup', onUp, true);
    stage.addEventListener('pointercancel', () => { if (box) clear(); }, true);
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (box || ask)) { e.stopImmediatePropagation(); clear(); }
      else if (e.key === 'Enter' && ask) { e.preventDefault(); e.stopImmediatePropagation(); confirm(); }
      else if (e.key === 'Shift') canvas.classList.toggle('doze-box', tool() === 'bulldoze');
    }, true);
    addEventListener('keyup', (e) => { if (e.key === 'Shift') canvas.classList.remove('doze-box'); });

    return {
      onTool() { clear(); canvas.classList.remove('doze-box'); },
    };
  },
};
