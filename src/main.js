// Wires sim, render and UI. The only file that knows all three.
import { getLayout } from './world/layout.js';
import { createSim } from './sim/sim.js';
import { loadGame, writeSave, clearSave, exportText, importText, restoreBackup, backupInfo } from './sim/save.js';
import { createScene } from './render/scene.js';
import { createUi } from './ui/ui.js';
import { $, fmtAgo } from './ui/format.js';

const AUTOSAVE_MS = 45000;
const params = new URLSearchParams(location.search);
const layout = getLayout();
const app = $('app');

// ---- load ----
const loaded = loadGame();
const state = loaded.state;
const sim = createSim({ state, layout });
const awayOverride = Number(params.get('away')); // ?away=<seconds> forces an offline return for testing
if (Number.isFinite(awayOverride) && awayOverride > 0) sim.catchUp(Date.now() - awayOverride * 1000);
else sim.catchUp(loaded.savedAt);

// ---- render ----
let scene;
try {
  scene = createScene({ stage: $('stage'), layout, grid: sim.grid, onPick: (id) => ui.onPick(id), onCancel: () => ui.onCancel() });
} catch (err) {
  const f = document.createElement('div');
  f.className = 'fallback';
  f.textContent = 'Nexus needs WebGL to draw the town. Try another browser or enable hardware acceleration.';
  app.appendChild(f);
  throw err;
}

// ---- save / export / import ----
// saveBlocked is set right before a reload that must not be overwritten by the in-memory town (import, restore, start over).
let saveBlocked = false, lastSaved = null, saveFailing = false;
const save = () => {
  if (saveBlocked) return;
  const now = Date.now();
  if (writeSave(sim.prepareSave(), now)) { lastSaved = now; saveFailing = false; return; }
  if (!saveFailing) { saveFailing = true; ui.toast('Autosave could not write to this browser. Export a copy from Settings.'); }
};
const actions = {
  exportSave() {
    const blob = new Blob([exportText(sim.prepareSave(), Date.now())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nexus-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importPick() { $('importfile').click(); },
  // Start over moves the town into the backup slot first, so Settings can restore it.
  reset() { saveBlocked = true; clearSave(); location.reload(); },
  restore() {
    saveBlocked = true;
    if (restoreBackup(undefined, Date.now())) location.reload();
    else { saveBlocked = false; ui.toast('Could not restore the backup'); }
  },
  backup: () => backupInfo(),
  status: () => (saveFailing ? 'Autosave is having trouble in this browser. Export a copy to keep your town.'
    : lastSaved ? 'Saved ' + fmtAgo(lastSaved) + '. Autosaves every 45 seconds.' : 'Autosaves every 45 seconds.'),
};
$('importfile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let text = '';
  try { text = await file.text(); } catch { ui.toast('Could not read that file'); return; }
  const r = importText(text);
  if (!r.ok) { ui.toast('That is not a Nexus save: ' + r.error); return; }
  ui.askConfirm({
    title: 'Replace this town?',
    text: 'The file holds a town saved ' + fmtAgo(r.savedAt) + '. Your current town moves to the backup slot.',
    ok: 'Replace my town',
    onOk: () => {
      saveBlocked = true;
      if (writeSave(r.state, Date.now(), undefined, { forceBackup: true })) location.reload();
      else { saveBlocked = false; ui.toast('This browser will not store saves'); }
    },
  });
});
if (loaded.notice) setTimeout(() => ui.toast(loaded.notice), 400);
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
