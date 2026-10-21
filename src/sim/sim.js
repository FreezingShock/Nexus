// The simulation: plain data in, plain data out. No DOM, no THREE.
import { getLayout } from '../world/layout.js';
import { ROAD_TYPES, RING_ROAD_TILES } from './catalog.js';
import { PARTS_RATE, MAX_LEVEL, coinRate, levelOf, upgradeCost } from './economy.js';
import { MIN_POSTCARD_S, awaySeconds, offlineWindow } from './offline.js';
import { freshState } from './state.js';

const SPEEDS = [1, 2, 3];

export function createSim({ state = freshState(), layout = getLayout(), now = () => Date.now() } = {}) {
  const listeners = new Set();
  const byId = new Map(layout.buildings.map((b) => [b.id, b]));
  let acc = 0;
  let prev = { coins: state.coins, parts: state.parts };
  let rate = coinRate(state, layout);
  const sim = { state, layout, lastTickMs: 0, ticks: 0 };

  const emit = (e) => listeners.forEach((fn) => fn(e));
  const note = (k, n = '') => { state.log.push({ k, n }); if (state.log.length > 8) state.log.shift(); };
  const refresh = () => { rate = coinRate(state, layout); };

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

  const commands = {
    upgrade({ id }) {
      if (!sim.alive(id)) return;
      const b = byId.get(id), lv = levelOf(state, b), c = upgradeCost(b.floors, lv);
      if (lv >= MAX_LEVEL) return emit({ type: 'toast', text: b.name + ' is at the top level' });
      if (state.coins < c) return emit({ type: 'toast', text: 'Not enough coins yet' });
      state.coins -= c; prev.coins = Math.min(prev.coins, state.coins);
      state.levels[id] = lv + 1;
      refresh(); note('up', b.name);
      emit({ type: 'upgraded', id, text: b.name + ' upgraded to level ' + (lv + 1) });
    },
    bulldoze({ id }) {
      if (!sim.alive(id)) return;
      state.removed.push(id); refresh(); note('doze', byId.get(id).name);
      emit({ type: 'bulldozed', id, text: byId.get(id).name + ' removed' });
    },
    buildRoad({ roadType }) {
      const t = ROAD_TYPES.find((r) => r.id === roadType);
      if (!t || t.locked || state.ringRoad) return;
      const c = RING_ROAD_TILES * t.cost;
      if (state.coins < c) return emit({ type: 'toast', text: 'Not enough coins yet' });
      state.coins -= c; prev.coins = Math.min(prev.coins, state.coins);
      state.ringRoad = true; note('road');
      emit({ type: 'roadBuilt', text: 'Ring road built' });
    },
    setNight({ on }) { state.night = on ? 1 : 0; emit({ type: 'toast', text: state.night ? 'Night falls over the town' : 'Good morning' }); },
    cycleSpeed() { state.speed = SPEEDS[state.speed % SPEEDS.length]; },
    togglePause() { state.paused = !state.paused; },
    collectOffline() {
      const o = state.offline;
      if (!o) return;
      state.coins += o.coins; state.parts += o.parts; prev = { coins: state.coins, parts: state.parts };
      state.offline = null; state.log.length = 0;
      emit({ type: 'toast', text: 'Collected ' + Math.floor(o.coins).toLocaleString('en-US') + ' coins and ' + Math.floor(o.parts) + ' parts' });
    },
  };

  sim.dispatch = (cmd) => {
    const fn = commands[cmd && cmd.type];
    if (!fn) return;
    fn(cmd);
    emit({ type: 'changed' });
  };
  return sim;
}
