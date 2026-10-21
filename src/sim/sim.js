// The simulation: plain data in, plain data out. No DOM, no THREE.
import { getLayout } from '../world/layout.js';
import { registryOf } from '../core/registry.js';
import { createGrid } from '../world/grid.js';
import { systems as systemDefs } from './systems/index.js';
import { PARTS_RATE, coinRate, levelOf, upgradeCost } from './economy.js';
import { MIN_POSTCARD_S, awaySeconds, offlineWindow } from './offline.js';
import { freshState } from './state.js';

export function createSim({ state = freshState(), layout = getLayout(), now = () => Date.now() } = {}) {
  const listeners = new Set();
  const byId = new Map(layout.buildings.map((b) => [b.id, b]));
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
  let rate = 0;
  const sim = { state, layout, lastTickMs: 0, ticks: 0 };

  const emit = (e) => listeners.forEach((fn) => fn(e));
  const note = (k, n = '') => { state.log.push({ k, n }); if (state.log.length > 8) state.log.shift(); };
  const syncDisplay = () => { prev = { coins: state.coins, parts: state.parts }; };
  // Takes `cost` coins if affordable. Otherwise toasts and returns false.
  const charge = (cost) => {
    if (state.coins < cost) { emit({ type: 'toast', text: 'Not enough coins yet' }); return false; }
    state.coins -= cost; prev.coins = Math.min(prev.coins, state.coins);
    return true;
  };
  const refresh = () => {
    rate = coinRate(state, layout);
    for (const d of registry.list()) if (d.rate) rate += d.rate(ctx);
    rate = Math.round(rate * 10) / 10;
  };
  const grid = createGrid(layout);
  const ctx = { sim, state, layout, grid, emit, note, refresh, charge, syncDisplay };

  sim.subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  sim.rate = () => rate;
  sim.partsRate = () => PARTS_RATE;
  sim.building = (id) => byId.get(id);
  sim.alive = (id) => byId.has(id) && !state.removed.includes(id);
  sim.level = (id) => levelOf(state, byId.get(id));
  sim.cost = (id) => { const b = byId.get(id); return upgradeCost(b.floors, levelOf(state, b)); };
  // Interpolated currency for display: between the previous and current tick.
  sim.display = (alpha) => ({ coins: prev.coins + (state.coins - prev.coins) * alpha, parts: prev.parts + (state.parts - prev.parts) * alpha });

  // One fixed 1 Hz step.
  sim.tick = () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    prev = { coins: state.coins, parts: state.parts };
    state.coins += rate;
    state.parts += PARTS_RATE;
    registry.run('tick', ctx);
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
    const away = awaySeconds(savedAt, now());
    if (away <= 0) return null;
    const w = offlineWindow(away);
    const gainC = rate * w.effectiveS, gainP = PARTS_RATE * w.effectiveS;
    if (away < MIN_POSTCARD_S) { state.coins += gainC; state.parts += gainP; prev = { coins: state.coins, parts: state.parts }; return null; }
    const o = state.offline;
    state.offline = o
      ? { coins: o.coins + gainC, parts: o.parts + gainP, awayS: o.awayS + away, fullS: o.fullS + w.fullS, easeS: o.easeS + w.easeS }
      : { coins: gainC, parts: gainP, awayS: away, fullS: w.fullS, easeS: w.easeS };
    return state.offline;
  };

  sim.dispatch = (cmd) => {
    const fn = cmd && Object.prototype.hasOwnProperty.call(commands, cmd.type) ? commands[cmd.type] : null;
    if (!fn) return;
    fn(ctx, cmd);
    emit({ type: 'changed' });
  };
  sim.grid = grid;
  registry.run('init', ctx); // systems fill the grid layers they own from saved state
  refresh();
  return sim;
}
