// Services, parks and landmarks on the map. While the Buildings, Services or Parks tool is open, the tiles that each
// kind reaches get a soft tint; the lot under the cursor gets a stronger one. Each model in the flyout gets a tooltip,
// and a small paper card shows average happiness. Reads the sim and the flyout; sends nothing, changes no state.
import { canonicalDims, footprintsOf, modelById } from '../../world/models.js';
import { worldToTile } from '../../world/grid.js';
import { describeModel, reachOf, sourceOf } from '../../sim/services.js';
import { $ } from '../format.js';

// Which kind of coverage each tool shows. Buildings shows landmarks; Services and Parks show their own kind.
const KIND_OF_TOOL = { build: 'landmark', services: 'service', parks: 'park' };
const MIN_WEIGHT = 0.02;
const signed = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '/s';

export default {
  id: 'services',
  create({ sim, scene }) {
    const fly = document.getElementById('fly');
    const stage = scene.canvas.parentElement;
    const overlay = () => scene.sys('services-overlay');
    let kind = null, coverKey = '', cover = [], hover = null;

    // ---- coverage of every building of the tool's kind ----
    function refreshCover() {
      if (!kind) { cover = []; coverKey = ''; overlay().clear(); return; }
      const src = sim.services.sources().filter((s) => s.kind === kind);
      const key = src.map((s) => s.id).join(',');
      if (key !== coverKey) {
        coverKey = key;
        const seen = new Set();
        cover = [];
        for (const s of src) for (const [x, z, w] of reachOf(s)) {
          if (w < MIN_WEIGHT) continue;
          const k = z * 64 + x;
          if (!seen.has(k)) { seen.add(k); cover.push([x, z]); }
        }
      }
      redraw();
    }

    // ---- the lot under the cursor: a preview of what the flyout's model would reach ----
    function previewLot(gx, gz) {
      const model = fly.querySelector('[data-pm][aria-pressed="true"]');
      const size = fly.querySelector('[data-psize][aria-pressed="true"]');
      const def = model && modelById(model.dataset.pm);
      if (!def) return null;
      const [a, b] = footprintsOf(def)[size ? Number(size.dataset.psize) : 0] || footprintsOf(def)[0];
      const [fw, fd] = canonicalDims(def, [a, b]);
      return sourceOf({ id: 'preview', model: def.id, gx: gx - Math.floor((fw - 1) / 2), gz: gz - Math.floor((fd - 1) / 2), fw, fd });
    }

    function redraw() {
      if (!kind) return;
      const focus = [];
      if (hover) {
        const p = previewLot(hover[0], hover[1]);
        if (p && p.kind === kind) for (const [x, z, w] of reachOf(p)) if (w >= MIN_WEIGHT) focus.push([x, z]);
      }
      if (!cover.length && !focus.length) { overlay().clear(); return; }
      overlay().show({ cover, focus });
    }

    function onMove(e) {
      if (!kind) return;
      const p = scene.ground(e.clientX, e.clientY);
      const next = p ? worldToTile(p.x, p.z) : null;
      if (next && hover && next[0] === hover[0] && next[1] === hover[1]) return;
      hover = next;
      redraw();
    }
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', () => { hover = null; redraw(); });

    // ---- tooltips on the flyout's model buttons ----
    new MutationObserver(() => {
      fly.querySelectorAll('[data-pm]').forEach((b) => { const t = describeModel(b.dataset.pm); if (t) b.title = t; });
    }).observe(fly, { childList: true, subtree: true });

    // ---- happiness card ----
    const card = document.createElement('div');
    card.id = 'services-card'; card.className = 'card';
    card.innerHTML = '<div class="sv-head"><h3>Happiness</h3><span class="sv-pct"></span></div>' +
      '<div class="sv-meter" role="img" aria-label="Average happiness"><i></i></div><p class="sub sv-note"></p>';
    $('app').appendChild(card);
    const pct = card.querySelector('.sv-pct'), bar = card.querySelector('.sv-meter i'), note = card.querySelector('.sv-note');
    function syncCard() {
      const s = sim.services.summary(), p = Math.round(s.average * 100);
      pct.textContent = s.built ? p + '%' : '—';
      bar.style.width = s.built ? Math.max(4, p) + '%' : '0%';
      if (!s.services && !s.parks && !s.landmarks) note.textContent = 'A clinic or a park lifts the streets around it.';
      else note.textContent = s.services + ' services · ' + s.parks + ' parks · ' + s.landmarks + ' landmarks. Net ' +
        signed(s.moodCoins + s.landmarkCoins - s.upkeep) + ' from happy streets, landmarks and upkeep';
    }
    syncCard();
    let acc = 0;

    return {
      onTool(t) {
        kind = KIND_OF_TOOL[t] || null;
        hover = null; coverKey = '';
        refreshCover();
      },
      frame(dt) {
        acc += dt;
        if (acc < 0.25) return;
        acc = 0;
        syncCard();
      },
      onEvent(e) {
        if (e.type === 'changed' || e.type === 'placed' || e.type === 'bulldozed') refreshCover();
      },
    };
  },
};
