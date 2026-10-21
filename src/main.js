// Wires sim, render and UI. The only file that knows all three.
import { getLayout } from './world/layout.js';
import { createSim } from './sim/sim.js';
import { freshState } from './sim/state.js';
import { readSave, writeSave, clearSave, wrap, unwrap, SAVE_KEY } from './sim/save.js';
import { createScene } from './render/scene.js';
import { createUi } from './ui/ui.js';
import { $ } from './ui/format.js';

const AUTOSAVE_MS = 45000;
const params = new URLSearchParams(location.search);
const layout = getLayout();
const app = $('app');

// ---- load ----
const loaded = readSave();
const state = loaded.ok ? loaded.state : freshState();
const sim = createSim({ state, layout });
const awayOverride = Number(params.get('away')); // ?away=<seconds> forces an offline return for testing
if (Number.isFinite(awayOverride) && awayOverride > 0) sim.catchUp(Date.now() - awayOverride * 1000);
else if (loaded.ok) sim.catchUp(loaded.savedAt);

// ---- render ----
let scene;
try {
  scene = createScene({ stage: $('stage'), layout, onPick: (id) => ui.onPick(id) });
} catch (err) {
  const f = document.createElement('div');
  f.className = 'fallback';
  f.textContent = 'Nexus needs WebGL to draw the town. Try another browser or enable hardware acceleration.';
  app.appendChild(f);
  throw err;
}

// ---- save / export / import ----
let saveBlocked = false;
const save = () => { if (!saveBlocked) writeSave(state, Date.now()); };
const actions = {
  exportSave() {
    const blob = new Blob([JSON.stringify(wrap(state, Date.now()), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nexus-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importPick() { $('importfile').click(); },
  reset() { saveBlocked = true; clearSave(); location.reload(); },
};
$('importfile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let text = '';
  try { text = await file.text(); } catch { ui.toast('Could not read that file'); return; }
  const r = unwrap(text);
  if (!r.ok) { ui.toast('Not a usable save: ' + r.error); return; }
  let stored = false;
  try { localStorage.setItem(SAVE_KEY, text); stored = true; } catch { /* handled below */ }
  if (!stored) { ui.toast('This browser will not store saves'); return; }
  saveBlocked = true; location.reload();
});
setInterval(save, AUTOSAVE_MS);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// ---- ui ----
const ui = createUi({ sim, scene, actions });
if (state.night) scene.snap(true);
if (state.offline) ui.showPostcard();

if (params.has('debug')) window.__nexus = { sim, scene, ui, layout };

// ---- loop ----
let last = performance.now(), t = 0, duskAcc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  const alpha = sim.advance(dt);
  const simDt = state.paused ? 0 : dt * state.speed;
  scene.frame(dt, t, simDt, state, ui.tool());
  ui.frame(dt, t, alpha);
  if (ui.postcard.isOpen()) { duskAcc += dt; if (duskAcc > 0.06) { duskAcc = 0; ui.postcard.frame(t); } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
