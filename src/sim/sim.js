// The simulation: plain data in, plain data out. No DOM, no THREE.
import { getLayout } from '../world/layout.js';
import { setTerrainSeed } from '../world/terrain.js';
import { registryOf } from '../core/registry.js';
import { createGrid } from '../world/grid.js';
import { systems as systemDefs } from './systems/index.js';
import { BASE_RATE, PARTS_RATE, levelOf, upgradeCost } from './economy.js';
import { MIN_POSTCARD_S, awaySeconds, offlineWindow } from './offline.js';
import { freshState } from './state.js';
import { sanitizeCalendar } from '../core/calendar.js';
import { refreshCalendar } from './systems/calendar.js';

export function createSim({ state = freshState(), layout, now = () => Date.now() } = {}) {
  // The land comes first: the grid, the scenery and every height query read it.
  setTerrainSeed(state.terrainSeed);
  layout = layout || getLayout();
  const listeners = new Set();
  let acc = 0;
  let prev = { coins: state.coins, parts: state.parts };
  const registry = registryOf('sim systems', systemDefs);
  const commands = {};
  for (const d of registry.list()) {
    for (const [name, fn] of Object.entries(d.commands || {})) {
      if (commands[name]) throw new Error('sim systems: command "' + name + '" is defined twice');
      commands[name] = fn;
    }
  }
  let rate = 0, partsRate = PARTS_RATE;
  // Per-browser calendar choices (locks, lengths). Read by systems/calendar.js; never saved.
  const sim = { state, layout, lastTickMs: 0, ticks: 0, calendarOptions: sanitizeCalendar(null) };

  const emit = (e) => listeners.forEach((fn) => fn(e));
  const note = (k, n = '') => { state.log.push({ k, n }); if (state.log.length > 8) state.log.shift(); };
  const syncDisplay = () => { prev = { coins: state.coins, parts: state.parts }; };
  // Takes `cost` coins if affordable. Otherwise toasts and returns false.
  const charge = (cost) => {
    if (state.coins < cost) { emit({ type: 'toast', text: 'Not enough coins yet' }); return false; }
    state.coins -= cost; prev.coins = Math.min(prev.coins, state.coins);
    return true;
  };
  // Coins: buildings and systems' `rate`, then every system's `mult` (boost, Renewal). Parts: base plus systems' `partsRate`.
  // The same sums, split by system id, for the HUD's hover cards. Refreshed with the rates, never per frame.
  let breakdown = { coins: {}, parts: {}, mult: {} };
  const refresh = () => {
    let coins = BASE_RATE, parts = PARTS_RATE, m = 1;
    const byCoins = { base: BASE_RATE }, byParts = { base: PARTS_RATE }, byMult = {};
    for (const d of registry.list()) {
      if (d.rate) { const v = d.rate(ctx); coins += v; byCoins[d.id] = (byCoins[d.id] || 0) + v; }
      if (d.partsRate) { const v = d.partsRate(ctx); parts += v; byParts[d.id] = (byParts[d.id] || 0) + v; }
      if (d.mult) { const x = d.mult(ctx); m *= x; byMult[d.id] = x; }
    }
    rate = Math.round(coins * m * 10) / 10;
    partsRate = Math.round(parts * 100) / 100;
    breakdown = { coins: byCoins, parts: byParts, mult: byMult };
  };
  const grid = createGrid(layout);
  // rebuild: re-runs every system's init after a Renewal wipes the state, so init must be safe to run twice.
  const ctx = { sim, state, layout, grid, emit, note, refresh, charge, syncDisplay, rebuild: () => registry.run('init', ctx) };

  sim.subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  sim.rate = () => rate;
  sim.partsRate = () => partsRate;
  // Per-system parts of the income: { coins, parts, mult } keyed by system id. Read-only: callers must not write to it.
  sim.breakdown = () => breakdown;
  sim.now = now;
  // Buildings are placed records (the starter town included): the placement system answers for them.
  sim.building = () => null;
  sim.alive = () => false;
  sim.level = (id) => levelOf(state, sim.building(id));
  sim.cost = (id) => { const b = sim.building(id); return b ? upgradeCost(b.floors, levelOf(state, b)) : 0; };
  // Interpolated currency for display: between the previous and current tick.
  sim.display = (alpha) => ({ coins: prev.coins + (state.coins - prev.coins) * alpha, parts: prev.parts + (state.parts - prev.parts) * alpha });

  // One fixed 1 Hz step.
  sim.tick = () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    prev = { coins: state.coins, parts: state.parts };
    const gain = rate;
    state.coins += gain;
    state.parts += partsRate;
    registry.run('tick', ctx, gain);
    sim.ticks++;
    sim.lastTickMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  };

  // Called every frame with wall-clock seconds. Game speed means more ticks per second, not bigger steps.
  // Returns alpha in [0,1) for render interpolation.
  sim.advance = (dt) => {
    if (!state.paused) {
      acc += Math.min(Math.max(dt, 0), 0.25) * state.speed;
      let n = 0;
      while (acc >= 1 && n++ < 8) { sim.tick(); acc -= 1; }
      if (acc >= 1) acc = 0;
    }
    return acc;
  };

  // Offline catch-up on load: closed form, one evaluation.
  sim.catchUp = (savedAt) => {
    if (savedAt == null) return null; // no usable save time: nothing to catch up on (never treat it as the epoch)
    const away = awaySeconds(savedAt, now());
    if (away <= 0) return null;
    const w = offlineWindow(away);
    const gainC = rate * w.effectiveS, gainP = partsRate * w.effectiveS;
    registry.run('offline', ctx, w.effectiveS, gainC); // grown from here on; income above used the rate before growth
    if (away < MIN_POSTCARD_S) { state.coins += gainC; state.parts += gainP; prev = { coins: state.coins, parts: state.parts }; return null; }
    const o = state.offline;
    state.offline = o
      ? { coins: o.coins + gainC, parts: o.parts + gainP, awayS: o.awayS + away, fullS: o.fullS + w.fullS, easeS: o.easeS + w.easeS }
      : { coins: gainC, parts: gainP, awayS: away, fullS: w.fullS, easeS: w.easeS };
    return state.offline;
  };

  // Every save and export goes through here: systems rebuild their saved layers from the grid first (beforeSave hook).
  sim.prepareSave = () => { registry.run('beforeSave', ctx); return state; };

  sim.dispatch = (cmd) => {
    const fn = cmd && Object.prototype.hasOwnProperty.call(commands, cmd.type) ? commands[cmd.type] : null;
    if (!fn) return;
    fn(ctx, cmd);
    emit({ type: 'changed' });
  };
  // Choices from the Settings card. Changing them only changes what the sky shows.
  sim.setCalendar = (o) => { sim.calendarOptions = sanitizeCalendar(o); refreshCalendar(ctx); };
  sim.grid = grid;
  registry.run('init', ctx); // systems fill the grid layers they own from saved state
  refresh();
  return sim;
}
