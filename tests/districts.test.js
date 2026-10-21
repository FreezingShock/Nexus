import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { wrap, unwrap } from '../src/sim/save.js';
import { GRID_N, BASE, tileIndex } from '../src/world/grid.js';
import {
  MAX_DISTRICTS, NAME_MAX, nameFor, cleanName, encodeDistricts, decodeDistricts, validDistrictString,
  districtAnchors, lotsByDistrict, DISTRICT_COLORS,
} from '../src/world/districts.js';

const mk = (state = freshState()) => { state.coins = 100; return createSim({ state }); };

// A river tile, which districts refuse.
function waterTile(sim) {
  for (let z = 0; z < GRID_N; z++) for (let x = 0; x < GRID_N; x++) if (sim.grid.baseAt(x, z) === BASE.WATER) return [x, z];
  throw new Error('no water in the test town');
}

test('generated names are deterministic, cozy and varied', () => {
  assert.equal(nameFor(7), nameFor(7));
  const names = new Set();
  for (let s = 1; s <= 60; s++) {
    const n = nameFor(s);
    assert.match(n, /^\p{L}+ \p{L}+$/u);
    assert.ok(n.length <= NAME_MAX);
    names.add(n);
  }
  assert.ok(names.size > 25, 'a few dozen seeds should give a good spread of names');
});

test('typed names are cleaned: letters, spaces, apostrophes and hyphens only, trimmed and capped', () => {
  assert.equal(cleanName('  Old   Mill  Row '), 'Old Mill Row');
  assert.equal(cleanName("Saint-Jean's Yard 2"), "Saint-Jean's Yard");
  assert.equal(cleanName('Lantern <Corner>'), 'Lantern Corner');
  assert.equal(cleanName('x'.repeat(40)).length, NAME_MAX);
  assert.equal(cleanName('123 !!!'), '');
  assert.equal(cleanName(undefined), '');
});

test('a new district takes the first free slot with a generated name, and there are only fifteen', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'newDistrict' });
  assert.deepEqual(sim.state.districts.map((d) => d.slot), [1, 2]);
  assert.notEqual(sim.state.districts[0].name, sim.state.districts[1].name);
  for (let k = 2; k < MAX_DISTRICTS; k++) sim.dispatch({ type: 'newDistrict' });
  assert.equal(sim.state.districts.length, MAX_DISTRICTS);
  sim.dispatch({ type: 'newDistrict' });
  assert.equal(sim.state.districts.length, MAX_DISTRICTS, 'a sixteenth district is refused');
});

test('painting is free, covers land and skips water', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  const before = sim.state.coins;
  const w = waterTile(sim);
  sim.dispatch({ type: 'paintDistrict', slot: 1, a: w, b: [w[0] + 1, w[1]] });
  assert.equal(sim.grid.districtAt(w[0], w[1]), 0, 'water keeps no district');
  const [a, b] = [[4, 4], [6, 6]];
  sim.dispatch({ type: 'paintDistrict', slot: 1, a, b });
  assert.equal(sim.grid.districtAt(5, 5), 1);
  assert.equal(sim.state.coins, before, 'districts cost nothing');
  assert.ok(sim.state.drev > 0, 'the render sees a change');
});

test('painting with a slot that does not exist does nothing', () => {
  const sim = mk();
  sim.dispatch({ type: 'paintDistrict', slot: 3, a: [4, 4], b: [5, 5] });
  assert.equal(sim.grid.districtAt(4, 4), 0);
});

test('erase clears only its rectangle; delete clears the whole district and removes it', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'paintDistrict', slot: 1, a: [4, 4], b: [6, 6] });
  sim.dispatch({ type: 'paintDistrict', slot: 2, a: [7, 4], b: [8, 4] });
  sim.dispatch({ type: 'eraseDistrict', a: [4, 4], b: [4, 6] });
  assert.equal(sim.grid.districtAt(4, 5), 0);
  assert.equal(sim.grid.districtAt(5, 5), 1);
  assert.equal(sim.grid.districtAt(8, 4), 2);
  sim.dispatch({ type: 'deleteDistrict', slot: 1 });
  assert.deepEqual(sim.state.districts.map((d) => d.slot), [2]);
  assert.equal(sim.grid.districtAt(5, 5), 0);
  assert.equal(sim.grid.districtAt(8, 4), 2, 'other districts keep their tiles');
});

test('renaming cleans the name; an empty name gets a generated one; shuffling keeps the flag', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  const d = sim.state.districts[0];
  const { pal, style } = d;
  sim.dispatch({ type: 'renameDistrict', slot: 1, name: '  Lantern <Corner>  ' });
  assert.equal(d.name, 'Lantern Corner');
  sim.dispatch({ type: 'renameDistrict', slot: 1, name: '   ' });
  assert.match(d.name, /^\p{L}+ \p{L}+$/u);
  const old = d.name;
  for (let k = 0; k < 4 && d.name === old; k++) sim.dispatch({ type: 'shuffleDistrictName', slot: 1 });
  assert.notEqual(d.name, old);
  assert.equal(d.pal, pal);
  assert.equal(d.style, style);
});

test('districts and their tiles survive a save; tiles of a missing district are dropped on load', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'renameDistrict', slot: 1, name: 'Honeycomb Steps' });
  sim.dispatch({ type: 'paintDistrict', slot: 1, a: [4, 4], b: [5, 4] });
  const saved = unwrap(wrap(sim.prepareSave(), 1));
  assert.ok(saved.ok);
  const back = createSim({ state: saved.state });
  assert.equal(back.state.districts[0].name, 'Honeycomb Steps');
  assert.equal(back.grid.districtAt(5, 4), 1);

  // a save that names slot 9 with no such district: those tiles go, the rest stays
  const raw = JSON.parse(JSON.stringify(saved.state));
  const map = raw.dmap.split('');
  map[tileIndex(5, 4)] = '9';
  raw.dmap = map.join('');
  const fixed = unwrap(wrap(raw, 1));
  const again = createSim({ state: fixed.state });
  assert.equal(again.grid.districtAt(5, 4), 0);
  assert.equal(again.grid.districtAt(4, 4), 1);
});

test('a bad saved district is sanitised: out-of-range slot, duplicate slot, bad colours', () => {
  const s = freshState();
  s.districts = [
    { slot: 99, name: 'Nope', pal: 0, style: 0 },
    { slot: 2, name: 'Kestrel Hill', pal: 77, style: -4 },
    { slot: 2, name: 'Twin', pal: 0, style: 0 },
  ];
  const out = unwrap(wrap(s, 1)).state;
  assert.equal(out.districts.length, 1);
  assert.equal(out.districts[0].slot, 2);
  assert.equal(out.districts[0].name, 'Kestrel Hill');
  assert.ok(out.districts[0].pal < DISTRICT_COLORS.length);
  assert.equal(out.districts[0].style, 0);
});

test('the hex encoding round-trips, and only well-formed strings are accepted', () => {
  const layer = new Uint8Array(GRID_N * GRID_N);
  layer[0] = 1; layer[100] = 15; layer[4095] = 7;
  const str = encodeDistricts(layer);
  assert.ok(validDistrictString(str));
  assert.deepEqual(decodeDistricts(str, new Uint8Array(GRID_N * GRID_N)), layer);
  assert.equal(validDistrictString('0'.repeat(10)), false);
  assert.equal(validDistrictString('G'.repeat(GRID_N * GRID_N)), false);
});

test('anchors sit on a tile of their own district, away from water, and lots count per district', () => {
  const sim = mk();
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'newDistrict' });
  sim.dispatch({ type: 'paintDistrict', slot: 1, a: [4, 4], b: [6, 6] });
  sim.dispatch({ type: 'paintDistrict', slot: 2, a: [40, 40], b: [40, 40] });
  const found = districtAnchors(sim.grid);
  const one = found.get(1);
  assert.ok(one);
  assert.equal(one.count, 9);
  assert.equal(sim.grid.districtAt(one.gx, one.gz), 1);
  assert.notEqual(sim.grid.baseAt(one.gx, one.gz), BASE.WATER);
  assert.equal(found.get(2).count, 1);
  assert.equal(found.has(3), false, 'a district with no tiles has no flag');

  const lots = [[tileIndex(4, 4), 1, 0], [tileIndex(6, 6), 2, 0], [tileIndex(40, 40), 1, 0], [tileIndex(0, 0), 1, 0]];
  const counts = lotsByDistrict(sim.grid.district, lots);
  assert.equal(counts.get(1), 2);
  assert.equal(counts.get(2), 1);
});
