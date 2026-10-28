// Wires sim, render and UI. The only file that knows all three.
// The page opens on the title screen. Behind it the town builds quietly (the warm-up steps) and turns slowly; Play opens
// the progress screen for the rest of the load, then the town, then the offline postcard if there is one. Nothing
// advances and nothing is saved until Play, so the time away is counted from the last real save.
import { createSim } from './sim/sim.js';
import { loadGame, writeSave, clearSave, exportText, importText, restoreBackup, backupInfo } from './sim/save.js';
import { createQualityStore, detectEnv } from './core/quality.js';
import { createCalendarStore } from './core/calendar.js';
import { createSoundStore } from './audio/mix.js';
import { createProgress, chase, atLeast, shotAt, WARM_STEPS, PLAY_STEPS, MIN_STEP_MS, REVEAL_HOLD_MS } from './core/boot.js';
import { cinePose, LOW_TILT } from './render/photo-math.js';
import { ISO } from './render/camera-math.js';
import { createTitle } from './ui/title.js';
import { $, fmtAgo } from './ui/format.js';
import { readMetric } from './sim/achievement-metrics.js';
import { shortDate } from './ui/date-text.js';
import { summary as milestoneSummary } from './sim/achievements.js';
import { createProfileStore } from './core/profile.js';
import { createThemeStore } from './core/theme.js';
import { createControlsStore } from './core/controls.js';
import { createAccessStore, applyAccess } from './core/access.js';

const AUTOSAVE_MS = 45000;
const SKIP_KEY = 'nexus.skiptitle';
const params = new URLSearchParams(location.search);
const app = $('app');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A paint between steps so the bars move; a hidden tab does not fire animation frames, so never wait on one for long.
const paint = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const browserStorage = (() => { try { return localStorage; } catch { return null; } })();
// Reloads the page triggers itself (Renewal, import, restore, new town) go straight back into the town; a fresh launch
// always opens on the title screen.
const reloadIntoTown = () => { try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* the title shows again, nothing lost */ } location.reload(); };
const takeSkip = () => { try { const v = sessionStorage.getItem(SKIP_KEY); sessionStorage.removeItem(SKIP_KEY); return v === '1'; } catch { return false; } };
const skipTitle = takeSkip() || params.get('title') === '0';

let phase = 'title'; // 'title' (warm-up, then waiting), 'boot' (progress screen), 'play'
let sim, state, scene, ui = null, loaded, quality, calendar, sound, profile, controls;
// Light or dark paper for the UI. Made first, before the title, so nothing is ever drawn in the wrong colours.
// Access settings repaint the page before the first frame, so text size and colours never flash.
const access = createAccessStore({ storage: browserStorage, onChange: (a) => { applyAccess(a, document.documentElement); scene && scene.setAccess(a); } });
applyAccess(access.get(), document.documentElement);
const theme = createThemeStore({ storage: browserStorage, root: document.documentElement, media: typeof matchMedia === 'function' ? (q) => matchMedia(q) : null });
let saveBlocked = false, lastSaved = null, saveFailing = false;

// The controls that live in the page rather than the camera: the shortcut hint.
const applyControls = (c) => { document.documentElement.dataset.hint = c.keyHint ? 'on' : 'off'; };

// ---- saving ----
const save = () => {
  if (saveBlocked || phase !== 'play') return;
  const now = Date.now();
  if (writeSave(sim.prepareSave(), now)) { lastSaved = now; saveFailing = false; return; }
  if (!saveFailing) { saveFailing = true; ui.toast('Autosave could not write to this browser. Export a copy from Settings.'); }
};
const actions = {
  get quality() { return quality; },
  get calendar() { return calendar; },
  get sound() { return sound; },
  get profile() { return profile; },
  get theme() { return theme; },
  get access() { return access; },
  get controls() { return controls; },
  exportSave() {
    const blob = new Blob([exportText(sim.prepareSave(), Date.now())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nexus-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importPick() { $('importfile').click(); },
  previewPostcard() { ui.previewPostcard(); },
  // Start over moves the town into the backup slot first, so Settings can restore it.
  reset() { saveBlocked = true; if (profile) profile.newTown(); clearSave(); reloadIntoTown(); },
  restore() {
    saveBlocked = true;
    if (restoreBackup(undefined, Date.now())) reloadIntoTown();
    else { saveBlocked = false; ui.toast('Could not restore the backup'); }
  },
  backup: () => backupInfo(),
  status: () => (saveFailing ? 'Autosave is having trouble in this browser. Export a copy to keep your town.'
    : lastSaved ? 'Saved ' + fmtAgo(lastSaved) + '. Autosaves every 45 seconds.' : 'Autosaves every 45 seconds.'),
};

const title = createTitle({ onPlay: () => play(), onNewTown: () => actions.reset() });

// ---- warm-up: behind the title screen ----
const warm = createProgress(WARM_STEPS);
warm.subscribe((p) => title.warm(p.fraction()));
async function warmStep(id, fn) { warm.begin(id); const r = await fn(); warm.done(id); await paint(); return r; }

async function warmUp() {
  await paint(); await paint(); // the title is on screen before any heavy work starts
  await warmStep('fonts', async () => {
    if (!document.fonts) return;
    const fonts = Promise.all(['800 40px Fraunces', '16px Capriola'].map((f) => document.fonts.load(f).catch(() => null)));
    await Promise.race([fonts, sleep(1500)]); // never hold the title for a font
  });
  const { createScene } = await warmStep('modules', async () => {
    const [sceneMod] = await Promise.all([import('./render/scene.js'), import('./ui/ui.js')]);
    return sceneMod;
  });
  await warmStep('save', async () => {
    loaded = loadGame();
    state = loaded.state;
    title.saveInfo(loaded.source, loaded.savedAt ? fmtAgo(loaded.savedAt) : '');
  });
  await warmStep('sim', async () => { sim = createSim({ state }); });
  await warmStep('scene', async () => {
    try {
      scene = createScene({ stage: $('stage'), layout: sim.layout, grid: sim.grid, onPick: (id) => ui && ui.onPick(id), onCancel: () => ui && ui.onCancel() });
    } catch (err) {
      const f = document.createElement('div');
      f.className = 'fallback';
      f.textContent = 'Nexus needs WebGL to draw the town. Try another browser or enable hardware acceleration.';
      app.appendChild(f);
      title.failed('Nexus needs WebGL to draw the town.');
      throw err;
    }
  });
  await warmStep('stores', async () => {
    // Graphics, time and sound choices live under their own keys, so Start over leaves them alone.
    quality = createQualityStore({ storage: browserStorage, env: detectEnv(), onChange: (q) => scene.setQuality(q) });
    scene.setQuality(quality.get());
    calendar = createCalendarStore({ storage: browserStorage, onChange: (o) => sim.setCalendar(o) });
    sim.setCalendar(calendar.get());
    sound = createSoundStore({ storage: browserStorage });
    controls = createControlsStore({ storage: browserStorage, onChange: (c) => { scene.setControls(c); applyControls(c); } });
    scene.setControls(controls.get()); applyControls(controls.get());
    scene.setAccess(access.get());
    profile = createProfileStore({ storage: browserStorage }); // the mayor: kept per browser, outlasts any one town
    profile.firstTown();
    noteBests();
  });
  try { title.townInfo({ pop: readMetric('population', { sim, state, grid: sim.grid }), coins: state.coins, date: shortDate(state) + ', Year ' + state.year }); }
  catch (err) { console.warn('town snapshot skipped', err); } // the card simply goes without it
  const v = scene.camera.view;
  base = { tx: v.tx, tz: v.tz, az: v.az, elev: v.elev, zoom: v.tzoom };
  scene.camera.setFloor(LOW_TILT); // the street-level shot goes lower than the game's own view allows
  requestAnimationFrame(frame);
  title.town(state);
  title.ready({ quality, sound, profile, theme });
  if (skipTitle) play();
}

// The profile's personal bests: the population record and the most milestone stages reached.
function noteBests() {
  try { profile.note({ pop: readMetric('population', { sim, state, grid: sim.grid }), stages: milestoneSummary(state).stages }); }
  catch (err) { console.warn('profile bests skipped', err); }
}
const PROFILE_EVERY_MS = 15000; // time played is counted in these steps, only while the tab is showing

// ---- play: the progress screen, then the town ----
let bootP = null, shown = 0, base = null;
let titleT = 0, shotIx = -1, shotBase = null;
// A cut: the camera jumps to the next shot's viewpoint while the paper curtain covers the town.
function cutTo(sh) {
  shotIx = sh.index;
  const cam = scene.camera, v = cam.view, vp = sh.view;
  cam.setLens(vp.lens, vp.fov);
  shotBase = { tx: base.tx + sh.shot.at[0], tz: base.tz + sh.shot.at[1], az: base.az + sh.shot.turn, elev: vp.elev };
  v.tzoom = v.zoom = vp.zoom;
  v.ttx = v.tx = shotBase.tx; v.ttz = v.tz = shotBase.tz;
  v.taz = v.az = shotBase.az; v.telev = v.elev = Math.max(vp.elev, LOW_TILT);
}
async function play() {
  if (phase !== 'title') return;
  phase = 'boot';
  title.hideTitle();
  await sleep(260); // the title card has gone before the progress screen arrives
  bootP = createProgress(PLAY_STEPS);
  title.showBoot(PLAY_STEPS);
  const run = (id, fn) => { bootP.begin(id); return atLeast(MIN_STEP_MS, async () => { const r = await fn(); bootP.done(id); return r; }); };

  await run('away', async () => {
    // ?away=<seconds> forces an offline return for testing
    const awayOverride = Number(params.get('away'));
    if (Number.isFinite(awayOverride) && awayOverride > 0) sim.catchUp(Date.now() - awayOverride * 1000);
    else sim.catchUp(loaded.savedAt);
  });
  await run('ui', async () => {
    const { createUi } = await import('./ui/ui.js');
    ui = createUi({ sim, scene, actions });
  });
  await run('lamps', async () => {
    for (let i = 0; i < 4; i++) { scene.frame(0.016, i * 0.016, 0, state, ui.tool()); await paint(); } // shaders compile on these
  });
  await run('post', async () => {
    if (loaded.notice) setTimeout(() => ui.toast(loaded.notice), 400);
    // Renewal rolls new land. The ground, the scenery and the picture of the map are built once per page, so the page
    // reloads on the saved town, a moment after the Renewal message has shown.
    sim.subscribe((e) => { if (e.type === 'renewed') setTimeout(() => { save(); reloadIntoTown(); }, 2200); });
    if (params.has('debug')) window.__nexus = { sim, scene, ui, layout: sim.layout };
  });

  while (shown < 0.999) await sleep(40); // the bar finishes its walk
  await sleep(REVEAL_HOLD_MS);
  open();
}

function open() {
  const v = scene.camera.view;
  scene.camera.setLens('ortho'); scene.camera.setFloor(ISO.elevMin); // the game's own view comes back, easing from where the shot stopped
  v.taz = v.az; v.ttx = base.tx; v.ttz = base.tz; v.telev = base.elev; v.tzoom = base.zoom;
  title.curtain(0);
  phase = 'play';
  last = performance.now();
  save(); // nothing yet: the first real save is the autosave. Guarded, so a hidden tab at this moment cannot lose the away time.
  document.body.classList.replace('booting', 'revealing');
  title.hideBoot();
  setInterval(save, AUTOSAVE_MS);
  setInterval(() => { if (document.visibilityState !== 'hidden') { profile.addPlay(PROFILE_EVERY_MS); noteBests(); } }, PROFILE_EVERY_MS);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  setTimeout(() => { if (state.offline) ui.showPostcard(); }, 750);
  setTimeout(() => document.body.classList.remove('revealing'), 1400);
}

// ---- import (needs the ui for its confirm card, so it can only be used inside the town) ----
$('importfile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file || !ui) return;
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
      if (writeSave(r.state, Date.now(), undefined, { forceBackup: true })) reloadIntoTown();
      else { saveBlocked = false; ui.toast('This browser will not store saves'); }
    },
  });
});

// ---- loop ----
let last = performance.now(), t = 0, duskAcc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  if (phase === 'play') {
    const alpha = sim.advance(dt);
    const simDt = state.paused ? 0 : dt * state.speed;
    scene.frame(dt, t, simDt, state, ui.tool());
    ui.frame(dt, t, alpha);
    if (ui.postcard.isOpen()) { duskAcc += dt; if (duskAcc > 0.06) { duskAcc = 0; ui.postcard.frame(t); } }
  } else {
    // Title and progress screens: the sim stands still while the camera cuts between slow shots of the town, whose life carries on.
    titleT += dt;
    const sh = shotAt(titleT);
    if (sh.index !== shotIx) cutTo(sh);
    const v = scene.camera.view, p = cinePose(sh.shot.move, sh.local, shotBase, sh.shot.speed);
    v.ttx = p.tx; v.ttz = p.tz; v.taz = p.az; v.telev = Math.max(p.elev, LOW_TILT);
    title.curtain(sh.curtain);
    scene.frame(dt, t, dt, state, null);
    if (phase === 'boot' && bootP) { shown = chase(shown, bootP.fraction(), dt); title.bootFrame(shown, bootP); }
  }
  requestAnimationFrame(frame);
}

warmUp().catch((err) => { console.error(err); title.failed('Something went wrong while loading: ' + (err && err.message ? err.message : err)); });
