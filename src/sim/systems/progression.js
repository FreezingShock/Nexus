// Economy and progression: Charge boosts, Parts-paid goals, a daily bonus with a streak, milestones and Renewal.
// Income multiplier comes from `mult`. Everything here is saved through state() and sanitize(); see docs/ECONOMY.md.
// Hooks run again after Renewal (ctx.rebuild), so init subscribes only once.
import { BALANCE } from '../balance.js';
import { freshState } from '../state.js';
import { dayKey, goalDef, pendingPoints, pickGoal, pointsMult, rewardText, yesterdayKey } from '../progress.js';

const CH = BALANCE.charge;
const GOALS = BALANCE.goals;
const CHARGE_EVENTS = new Set(['placed', 'zonePainted', 'upgraded']);

const num = (x, d, lo = 0, hi = 1e15) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
const int = (x, d, lo = 0, hi = 1e9) => (Number.isInteger(x) ? Math.min(hi, Math.max(lo, x)) : d);
const STAT_KEYS = ['placed', 'painted', 'roadTiles', 'upgrades', 'boosts'];
const KNOWN_MILESTONES = new Set(BALANCE.milestones.map((m) => m.id));

function freshGoals() {
  let seq = 0;
  const slots = [];
  for (let i = 0; i < GOALS.open; i++) { const p = pickGoal(seq, slots.map((s) => s.k)); seq = p.seq; slots.push({ k: p.k, p: 0 }); }
  return { slots, seq, day: '', doneToday: 0, bonusDay: '', streak: 0 }; // the day is stamped on the first tick
}

const valueOf = (state, stat) => {
  if (stat === 'earned') return state.earned;
  if (stat === 'renewals') return state.renewals;
  return state.stats[stat] || 0;
};

function payReward(ctx, reward) {
  const { state, syncDisplay } = ctx;
  if (reward.coins) state.coins += reward.coins;
  if (reward.parts) state.parts += reward.parts;
  syncDisplay();
}

function rollDay(ctx) {
  const g = ctx.state.goals, d = dayKey(ctx.sim.now());
  if (g.day !== d) { g.day = d; g.doneToday = 0; }
}

// Adds progress to every open goal of this kind. Finished goals pay once and are replaced from the seeded sequence.
function progressGoal(ctx, k, n) {
  const g = ctx.state.goals;
  if (!(n > 0)) return;
  for (let i = 0; i < g.slots.length; i++) {
    const slot = g.slots[i];
    if (slot.k !== k) continue;
    slot.p += n;
    const def = goalDef(k);
    if (def && slot.p >= def.target) completeGoal(ctx, i, def);
  }
}

function completeGoal(ctx, i, def) {
  const { state, emit } = ctx, g = state.goals;
  payReward(ctx, def.reward);
  rollDay(ctx);
  g.doneToday++;
  const next = pickGoal(g.seq, g.slots.filter((_, j) => j !== i).map((s) => s.k));
  g.seq = next.seq;
  g.slots[i] = { k: next.k, p: 0 };
  emit({ type: 'goalDone', text: 'Goal done: ' + def.name + ' · ' + rewardText(def.reward) });
  if (g.doneToday >= GOALS.open && g.bonusDay !== dayKey(ctx.sim.now())) dailyBonus(ctx);
}

// Once a day, when the day's goals are done. A missed day resets the streak only; the bonus never takes anything away.
function dailyBonus(ctx) {
  const { state, emit, sim } = ctx, g = state.goals, now = sim.now();
  g.streak = g.bonusDay === yesterdayKey(now) ? g.streak + 1 : 1;
  g.bonusDay = dayKey(now);
  const b = GOALS.dailyBonus;
  const parts = b.parts + b.perStreakDay * Math.min(g.streak - 1, b.maxStreakDays);
  state.parts += parts; ctx.syncDisplay();
  emit({ type: 'goalDone', text: 'Daily set done · +' + parts + ' Parts · ' + g.streak + '-day streak' });
}

function checkMilestones(ctx) {
  const { state, emit } = ctx;
  for (const m of BALANCE.milestones) {
    if (state.milestones.includes(m.id) || valueOf(state, m.stat) < m.n) continue;
    state.milestones = [...state.milestones, m.id];
    payReward(ctx, m.reward);
    emit({ type: 'goalDone', text: 'Milestone: ' + m.text + ' · ' + rewardText(m.reward) });
  }
}

const addCharge = (state, n) => { state.charge = Math.min(CH.max, state.charge + n); };

export default {
  id: 'progression',
  state: () => ({
    earned: 0,          // coins this town has ever earned; never reset
    runEarned: 0,       // coins earned since the last Renewal; becomes points when you Renew
    points: 0,          // Renewal points kept across Renewals: +2% income each
    renewals: 0,
    charge: 0,          // 0..100 active-play meter
    boostS: 0,          // seconds of boost left (cleared on load: a boost never runs while away)
    stats: { placed: 0, painted: 0, roadTiles: 0, upgrades: 0, boosts: 0 },
    milestones: [],     // ids of milestones already paid
    goals: freshGoals(),
  }),

  sanitize(raw, fresh) {
    const s = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = int(s[k], 0);
    const g = raw.goals && typeof raw.goals === 'object' ? raw.goals : null;
    const valid = g && Array.isArray(g.slots) && g.slots.length === GOALS.open && g.slots.every((x) => x && goalDef(x.k) && !g.slots.filter((y) => y.k === x.k)[1]);
    const goals = valid
      ? { slots: g.slots.map((x) => ({ k: x.k, p: num(x.p, 0, 0, 1e15) })), seq: int(g.seq, 0), day: typeof g.day === 'string' ? g.day.slice(0, 10) : '', doneToday: int(g.doneToday, 0, 0, 999), bonusDay: typeof g.bonusDay === 'string' ? g.bonusDay.slice(0, 10) : '', streak: int(g.streak, 0, 0, 9999) }
      : fresh.goals;
    return {
      earned: num(raw.earned, 0), runEarned: num(raw.runEarned, 0),
      points: int(raw.points, 0, 0, 10000), renewals: int(raw.renewals, 0, 0, 1e6),
      charge: num(raw.charge, 0, 0, CH.max), boostS: 0,
      stats,
      milestones: Array.isArray(raw.milestones) ? [...new Set(raw.milestones.filter((id) => KNOWN_MILESTONES.has(id)))] : [],
      goals,
    };
  },

  init(ctx) {
    if (ctx.sim.progressionHooked) return;
    ctx.sim.progressionHooked = true;
    ctx.sim.subscribe((e) => onEvent(ctx, e));
  },

  commands: {
    boost(ctx) {
      const { state, emit, refresh } = ctx;
      if (state.boostS > 0) return emit({ type: 'toast', text: 'A boost is already running' });
      if (state.charge < CH.boostCost) return emit({ type: 'toast', text: 'Charge ' + Math.floor(state.charge) + ' of ' + CH.boostCost + ' · Charge builds as you build' });
      state.charge -= CH.boostCost; state.boostS = CH.boostS; refresh();
      emit({ type: 'boosted', text: 'Charged up: coins ×' + CH.boostMult + ' for a minute' });
    },

    // Starts the town over. Keeps points, renewals, unlocked road tiers, milestones, goals, Charge, settings and lifetime coins.
    renew(ctx) {
      const { sim, state, grid, emit, refresh, syncDisplay, rebuild } = ctx;
      const gain = pendingPoints(state.runEarned);
      if (gain < 1) return emit({ type: 'toast', text: 'Renewal opens after ' + BALANCE.renewal.divisor.toLocaleString('en-US') + ' coins in one run' });
      const keep = {
        earned: state.earned, points: state.points + gain, renewals: state.renewals + 1,
        charge: state.charge, stats: state.stats, milestones: state.milestones, goals: state.goals,
        roadUnlocks: state.roadUnlocks, night: state.night, speed: state.speed, paused: state.paused,
      };
      const fresh = freshState();
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, fresh, keep, { runEarned: 0, offline: null, log: [] });
      grid.zone.fill(0); grid.road.fill(0); grid.lot.fill(0);
      rebuild();
      syncDisplay(); refresh();
      emit({ type: 'renewed', text: 'Renewed: +' + gain + (gain > 1 ? ' points' : ' point') + ' · income +' + Math.round((pointsMult(state.points) - 1) * 100) + '% for good' });
    },
  },

  // Runs once per 1 Hz tick with the coins that tick added (gain already includes boost and Renewal).
  tick(ctx, gain = 0) {
    const { state, refresh } = ctx;
    state.earned += gain; state.runEarned += gain;
    progressGoal(ctx, 'earn', gain);
    rollDay(ctx);
    if (state.charge < CH.max) state.charge = Math.min(CH.max, state.charge + CH.regenPerS);
    if (state.boostS > 0) { state.boostS = Math.max(0, state.boostS - 1); if (!state.boostS) refresh(); }
    checkMilestones(ctx);
  },

  // Closed-form catch-up: gainC is the coins the absence paid. Boosts never run while away.
  // Milestones are left to the next tick, so a welcome-back never pops rewards in the middle of loading.
  offline(ctx, seconds, gainC = 0) {
    const { state } = ctx;
    state.earned += gainC; state.runEarned += gainC;
    progressGoal(ctx, 'earn', gainC);
  },

  mult: ({ state }) => (state.boostS > 0 ? CH.boostMult : 1) * pointsMult(state.points),
};

function onEvent(ctx, e) {
  const { state } = ctx;
  switch (e.type) {
    case 'placed': state.stats.placed++; progressGoal(ctx, 'build', 1); break;
    case 'zonePainted': state.stats.painted += e.n; progressGoal(ctx, 'paint', e.n); break;
    case 'roadsChanged':
      if (e.kind !== 'draw') return;
      state.stats.roadTiles += e.tiles.length; progressGoal(ctx, 'road', e.tiles.length);
      break;
    case 'upgraded': state.stats.upgrades++; progressGoal(ctx, 'upgrade', 1); break;
    case 'boosted': state.stats.boosts++; progressGoal(ctx, 'boost', 1); break;
    default: return;
  }
  if (CHARGE_EVENTS.has(e.type) || e.type === 'roadsChanged') addCharge(state, CH.perAction);
  checkMilestones(ctx);
}
