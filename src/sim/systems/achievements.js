// Milestones and achievements: every goal has up to five stages, each paid once. See src/sim/achievements.js for the
// catalogue and src/sim/achievement-metrics.js for how each number is read. Saved as state.ach:
//   done    { goalId: stages paid }       the stages are never taken back
//   best    { metric: best value so far }  progress is measured on this, so a Renewal never costs a stage
//   counts  { goalsDone, dailies }         events nothing else counts
// Evaluated after every command and on every third tick, never in a loop over time away: a welcome-back leaves its
// rewards to the next tick, so they never pop up in the middle of loading.
import { ROAD_TYPES } from '../catalog.js';
import { GOALS, STAGES, fmtTarget, rewardFor, rewardLine, stagesReached, unlockFor } from '../achievements.js';
import { readMetric } from '../achievement-metrics.js';

const EVERY_TICKS = 3;
const MAX_NOTES = 2; // more completions than this in one pass are folded into a single postcard
const METRIC_NAMES = [...new Set(GOALS.map((g) => g.metric))];

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const int = (x, d, lo, hi) => (Number.isInteger(x) ? Math.min(hi, Math.max(lo, x)) : d);
const roadName = (id) => { const t = ROAD_TYPES.find((r) => r.id === id); return t ? t.short : id; };

const fresh = () => ({ done: {}, best: {}, counts: { goalsDone: 0, dailies: 0 } });

// Reads every metric, raises the bests, and pays every stage newly reached. Returns what was paid.
function evaluate(ctx) {
  const { state } = ctx;
  const ach = state.ach, paid = [];
  const live = {};
  for (const name of METRIC_NAMES) {
    const v = readMetric(name, ctx);
    live[name] = v;
    if (v > (ach.best[name] || 0)) ach.best[name] = Math.min(1e15, v);
  }
  for (const goal of GOALS) {
    // The best value counts, so does a counter the state keeps on its own (it can be ahead of the last read).
    const value = Math.max(ach.best[goal.metric] || 0, live[goal.metric] || 0);
    const reached = stagesReached(goal, value), had = ach.done[goal.id] || 0;
    for (let stage = had + 1; stage <= reached; stage++) paid.push({ goal, stage, reward: rewardFor(goal, stage), unlock: unlockFor(goal, stage) });
    if (reached > had) ach.done[goal.id] = reached;
  }
  return paid;
}

function pay(ctx, paid) {
  const { state, emit, syncDisplay } = ctx;
  let coins = 0, parts = 0;
  for (const p of paid) {
    coins += p.reward.coins; parts += p.reward.parts;
    if (p.unlock && !state.roadUnlocks.includes(p.unlock)) state.roadUnlocks = [...state.roadUnlocks, p.unlock];
  }
  state.coins += coins; state.parts += parts; syncDisplay();
  if (paid.length > MAX_NOTES) {
    const goals = new Set(paid.map((p) => p.goal.id)).size;
    const top = paid.reduce((a, p) => (p.stage > a ? p.stage : a), 1);
    emit({
      type: 'milestone', title: 'A bundle of milestones', tint: STAGES[top - 1].color,
      text: paid.length + ' stages across ' + goals + (goals === 1 ? ' goal' : ' goals') + ' · ' + rewardLine({ coins, parts }, null),
    });
    return;
  }
  for (const p of paid) {
    emit({
      type: 'milestone', title: STAGES[p.stage - 1].name + ' · ' + p.goal.name, tint: STAGES[p.stage - 1].color,
      text: fmtTarget(p.goal, p.goal.tiers[p.stage - 1]) + ' · ' + rewardLine(p.reward, p.unlock, roadName),
    });
  }
}

function check(ctx) {
  const paid = evaluate(ctx);
  if (paid.length) pay(ctx, paid);
}

export default {
  id: 'achievements',
  order: 100, // after progression and the grid owners, so every number it reads is this tick's

  state: () => ({ ach: fresh() }),

  sanitize(raw) {
    const a = isObj(raw.ach) ? raw.ach : {}, out = fresh();
    for (const g of GOALS) {
      const n = int(isObj(a.done) ? a.done[g.id] : 0, 0, 0, g.tiers.length);
      if (n) out.done[g.id] = n;
    }
    for (const name of METRIC_NAMES) {
      const v = isObj(a.best) ? a.best[name] : 0;
      if (Number.isFinite(v) && v > 0) out.best[name] = Math.min(1e15, v);
    }
    const c = isObj(a.counts) ? a.counts : {};
    out.counts = { goalsDone: int(c.goalsDone, 0, 0, 1e9), dailies: int(c.dailies, 0, 0, 1e9) };
    return { ach: out };
  },

  init(ctx) {
    if (ctx.sim.achievementsHooked) return; // runs again after a Renewal: subscribe only once
    ctx.sim.achievementsHooked = true;
    ctx.sim.subscribe((e) => {
      if (e.type === 'goalDone') {
        const c = ctx.state.ach.counts;
        if (e.kind === 'goal') c.goalsDone++;
        else if (e.kind === 'daily') c.dailies++;
      } else if (e.type === 'changed') check(ctx);
    });
  },

  tick(ctx) {
    if (ctx.sim.ticks % EVERY_TICKS === 0) check(ctx);
  },
};
