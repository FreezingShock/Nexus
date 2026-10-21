// Services, parks, landmarks, shops and industry on the map. While the Buildings, Services or Parks tool is open, the tiles
// that each kind reaches get a soft tint, and the tiles industry eases get a faint warm haze; the lot under the cursor gets
// a stronger preview. When a service, park or shop is placed, its ripple spreads and little hearts rise from the homes it
// lifted (skipped when the system asks for reduced motion). Each model in the flyout gets a tooltip, and a small paper card
// shows average happiness. Reads the sim and the flyout; sends nothing, changes no state.
import { canonicalDims, footprintsOf, modelById } from '../../world/models.js';
import { worldToTile } from '../../world/grid.js';
import { describeModel, reachOf, sourceOf } from '../../sim/services.js';
import { $ } from '../format.js';

// Which kinds of coverage each tool shows. Buildings shows shops and landmarks; Services and Parks show their own kind.
const KINDS_OF_TOOL = { build: ['shop', 'landmark'], services: ['service'], parks: ['park'] };
const MIN_WEIGHT = 0.02;
const signed = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '/s';
const calmer = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default {
  id: 'services',
  create({ sim, scene }) {
    const fly = document.getElementById('fly');
    const stage = scene.canvas.parentElement;
    const overlay = () => scene.sys('services-overlay');
    let kinds = null, coverKey = '', cover = [], haze = [], hover = null;

    // ---- coverage of every building of the tool's kinds, and the industrial haze ----
    function refreshCover() {
      if (!kinds) { cover = []; haze = []; coverKey = ''; overlay().clear(); return; }
      const all = sim.services.sourcesAll();
      const src = all.filter((s) => kinds.includes(s.kind));
      const industry = all.filter((s) => s.kind === 'industry');
      const key = src.map((s) => s.id).join(',') + '|' + industry.map((s) => s.id).join(',');
      if (key !== coverKey) {
        coverKey = key;
        cover = tilesOf(src);
        haze = tilesOf(industry);
      }
      redraw();
    }

    // The distinct tiles that a list of sources reaches, above the faint threshold.
    function tilesOf(list) {
      const seen = new Set(), out = [];
      for (const s of list) for (const [x, z, w] of reachOf(s)) {
        if (w < MIN_WEIGHT) continue;
        const k = z * 64 + x;
        if (!seen.has(k)) { seen.add(k); out.push([x, z]); }
      }
      return out;
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
      if (!kinds) return;
      const focus = [], focusHaze = [];
      if (hover) {
        const p = previewLot(hover[0], hover[1]);
        if (p) {
          const into = p.kind === 'industry' ? focusHaze : kinds.includes(p.kind) ? focus : null;
          if (into) for (const [x, z, w] of reachOf(p)) if (w >= MIN_WEIGHT) into.push([x, z]);
        }
      }
      if (!cover.length && !haze.length && !focus.length && !focusHaze.length) { overlay().clear(); return; }
      overlay().show({ cover, focus, haze: haze.concat(focusHaze) });
    }

    function onMove(e) {
      if (!kinds) return;
      const p = scene.ground(e.clientX, e.clientY);
      const next = p ? worldToTile(p.x, p.z) : null;
      if (next && hover && next[0] === hover[0] && next[1] === hover[1]) return;
      hover = next;
      redraw();
    }
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', () => { hover = null; redraw(); });

    // ---- the celebration when something lifts its neighbours ----
    // A ripple from the new building's centre, and a heart over each home it made happier. Sent by sim.services.gainsFor.
    function celebrate(fx) {
      const s = fx.source;
      overlay().ripple(s.gx + (s.fw - 1) / 2, s.gz + (s.fd - 1) / 2, s.radius + 1);
      const fxSys = scene.sys('happy-fx');
      if (fxSys) fxSys.burst(fx.gains);
    }

    // ---- tooltips on the flyout's model buttons ----
    new MutationObserver(() => {
      fly.querySelectorAll('[data-pm]').forEach((b) => { const t = describeModel(b.dataset.pm); if (t) b.title = t; });
    }).observe(fly, { childList: true, subtree: true });

    // ---- happiness card ----
    const card = document.createElement('div');
    card.id = 'services-card'; card.className = 'card';
    card.innerHTML = '<div class="sv-head"><h3>Happiness</h3><span class="sv-pct"></span></div>' +
      '<div class="sv-meter" role="img" aria-label="Average happiness"><i></i></div><p class="sub sv-note"></p>';
    $('leftcol').appendChild(card);
    const pct = card.querySelector('.sv-pct'), bar = card.querySelector('.sv-meter i'), note = card.querySelector('.sv-note');
    function syncCard() {
      const s = sim.services.summary(), p = Math.round(s.average * 100);
      pct.textContent = s.built ? p + '%' : '—';
      bar.style.width = s.built ? Math.max(4, p) + '%' : '0%';
      if (!s.services && !s.parks && !s.landmarks && !s.shops && !s.industry) {
        note.textContent = 'A clinic or a park lifts the streets around it. Shops lift the homes nearby; industry eases them a little.';
      } else {
        note.textContent = s.services + ' services · ' + s.parks + ' parks · ' + s.landmarks + ' landmarks · ' + s.shops + ' shops · ' +
          s.industry + ' industry. Net ' + signed(s.moodCoins + s.landmarkCoins - s.upkeep) + ' from happy streets, landmarks and upkeep';
      }
    }
    syncCard();
    let acc = 0;

    return {
      onTool(t) {
        kinds = KINDS_OF_TOOL[t] || null;
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
        if (e.type === 'placed' && !calmer()) {
          const fx = sim.services.gainsFor(e.id);
          if (fx) celebrate(fx);
        }
      },
    };
  },
};
