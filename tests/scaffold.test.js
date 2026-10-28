// Upgrade scaffolding (render/scaffold-plan.js): the plan wraps the building, fits the instance budget, and the timing
// grows every piece before the reveal and clears it after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scaffoldPieces, pieceGrowth, pieceAt, MAX_PIECES, RISE_S, REVEAL_S, DONE_S, DROP_S } from '../src/render/scaffold-plan.js';

const box = (w, h, d) => ({ min: { x: -w / 2, y: 0, z: -d / 2 }, max: { x: w / 2, y: h, z: d / 2 } });

test('scaffolding stands outside the walls and reaches above the roof', () => {
  const b = box(3, 4, 2), ps = scaffoldPieces(b);
  const poles = ps.filter((p) => p.kind === 'pole');
  assert.ok(poles.length >= 4, 'a pole at each corner at least');
  for (const p of poles) assert.ok(Math.abs(p.x) > 1.5 || Math.abs(p.z) > 1, 'outside the walls');
  for (const p of poles) assert.ok(p.y + p.sy / 2 > 4, 'above the roof');
  assert.ok(ps.some((p) => p.kind === 'board') && ps.some((p) => p.kind === 'brace') && ps.some((p) => p.kind === 'flag'));
});

test('even a huge tower stays inside one slot of the instanced mesh', () => {
  for (const [w, h, d] of [[0.5, 0.5, 0.5], [2, 2, 2], [8, 30, 8], [12, 60, 3]]) {
    const ps = scaffoldPieces(box(w, h, d));
    assert.ok(ps.length > 0 && ps.length <= MAX_PIECES, w + 'x' + h + 'x' + d + ': ' + ps.length);
    for (const p of ps) for (const k of ['x', 'y', 'z', 'sx', 'sy', 'sz', 'rx', 'rz', 'h']) assert.ok(Number.isFinite(p[k]), k);
  }
});

test('nothing shows at the start, everything is up before the reveal, and all is gone after', () => {
  const ps = scaffoldPieces(box(3, 5, 3));
  for (const p of ps) assert.equal(pieceGrowth(p, 0), 0);
  for (const p of ps) assert.ok(pieceGrowth(p, RISE_S + 0.01) >= 0.99, p.kind + ' up by the end of the rise');
  for (const p of ps) assert.ok(pieceGrowth(p, REVEAL_S - 0.01) >= 0.99, 'still up just before the reveal');
  for (const p of ps) assert.equal(pieceGrowth(p, DONE_S), 0, 'down by the end');
  const top = ps.find((p) => p.h === 1), low = ps.find((p) => p.kind === 'pole');
  assert.ok(pieceGrowth(low, 0.15) > pieceGrowth(top, 0.15), 'built from the bottom up');
  assert.ok(pieceGrowth(top, REVEAL_S + DROP_S * 0.5) <= pieceGrowth(low, REVEAL_S + DROP_S * 0.5), 'taken down from the top');
});

test('a cancelled build comes down early', () => {
  const ps = scaffoldPieces(box(2, 3, 2));
  for (const p of ps) assert.equal(pieceGrowth(p, 0.3 + DROP_S, 0.3), 0);
});

test('poles grow up from the ground, boards stretch along their length', () => {
  const ps = scaffoldPieces(box(3, 4, 3));
  const pole = ps.find((p) => p.kind === 'pole'), half = pieceAt(pole, 0.5);
  assert.ok(Math.abs((half.y - half.sy / 2) - (pole.y - pole.sy / 2)) < 1e-9, 'the foot stays on the ground');
  const board = ps.find((p) => p.kind === 'board'), hb = pieceAt(board, 0.5);
  assert.equal(hb.sy, board.sy);
  assert.ok(hb.sx < board.sx || hb.sz < board.sz);
});

test('scaffolding is render-only: the sim never sees it', () => {
  for (const f of ['src/render/scaffold-plan.js', 'src/render/systems/scaffold.js']) {
    const js = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /from '\.\.\/(\.\.\/)?sim\//, f);
  }
  const town = readFileSync(new URL('../src/render/town.js', import.meta.url), 'utf8');
  assert.match(town, /hooks\.scaffold/);
});

test('a placed building keeps its old look under the scaffolding and pops to the new level at the reveal', async () => {
  const THREE = await import('../vendor/three/three.module.min.js');
  const { createTown } = await import('../src/render/town.js');
  const scaffold = (await import('../src/render/systems/scaffold.js')).default;
  const { createSim } = await import('../src/sim/sim.js');
  const { freshState } = await import('../src/sim/state.js');
  const { getLayout } = await import('../src/world/layout.js');
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const id = sim.state.placed[0].id;
  const world = new THREE.Group();
  const scaf = scaffold.create({ world, sys: () => null });
  let raised = 0;
  const town = createTown(world, { scaffold: (m, b, cb) => { raised++; return scaf.raise(m, b, cb); } });
  const s = { ...sim.state, levels: { ...(sim.state.levels || {}) } };
  town.setState(s);
  const lv = s.levels[id] ?? 1;
  const levelOf = () => town.lifeEntries().find((e) => e.b.id === id)?.level;
  town.pop(id);
  s.levels = { ...s.levels, [id]: lv + 1 };
  town.setState(s);
  assert.equal(raised, 1, 'scaffolding went up');
  assert.equal(levelOf(), lv, 'still the old look');
  for (let t = 0; t < REVEAL_S + 0.1; t += 0.05) { scaf.frame({ dt: 0.05 }); town.setState(s); town.update(0.05); }
  for (let t = 0; t < 1; t += 0.05) { scaf.frame({ dt: 0.05 }); town.setState(s); town.update(0.05); }
  assert.equal(levelOf(), lv + 1, 'the new level after the reveal');
  assert.equal(raised, 1, 'the reveal pops; it never raises a second scaffold');
});

test('every level-up goes through the scaffold queue and ends with green arrows', () => {
  const lots = readFileSync(new URL('../src/render/systems/lots.js', import.meta.url), 'utf8');
  assert.match(lots, /l\[1\] > oldLevel/, 'any level increase, not only the player\'s, is an upgrade');
  assert.match(lots, /!inView\(l\)/, 'upgrades out of sight finish without a show');
  assert.match(lots, /MAX_QUEUE/, 'a big skip is capped');
  assert.match(lots, /sys\('arrows'\)\?\.burst/, 'the reveal throws arrows');
  const reg = readFileSync(new URL('../src/render/systems/index.js', import.meta.url), 'utf8');
  assert.match(reg, /import arrows from '\.\/arrows\.js'/);
});
