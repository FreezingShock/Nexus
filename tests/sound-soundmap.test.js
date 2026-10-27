// Where sounds come from: the sound map built from the town, and what the camera hears of it from where it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSoundMap, hear, rightOf, closeness, headingOf, KINDS, CELLS, HEAR } from '../src/audio/soundmap.js';
import { layersFor, LAYERS } from '../src/audio/soundscape.js';
import { GRID_N, BASE, tileIndex, tileCenter } from '../src/world/grid.js';

function blankGrid() {
  const n = GRID_N * GRID_N;
  return { base: new Uint8Array(n), road: new Uint8Array(n), zone: new Uint8Array(n), lot: new Uint16Array(n) };
}
// A street along row 48 on the west side, a band of water on the east, and a farm in the south-west corner.
function town() {
  const g = blankGrid();
  for (let gx = 10; gx < 40; gx++) g.road[tileIndex(gx, 48)] = 1;
  for (let gz = 0; gz < GRID_N; gz++) for (let gx = 80; gx < 86; gx++) g.base[tileIndex(gx, gz)] = BASE.WATER;
  const placed = [{ id: 'b1', model: 'farm', gx: 8, gz: 80, fw: 6, fd: 6 }, { id: 'b2', model: 'cottage', gx: 20, gz: 46, fw: 2, fd: 2 }];
  return buildSoundMap({ grid: g, placed, trees: [] });
}
const at = (gx, gz, h) => { const [x, z] = tileCenter(gx, gz); return { x, z, h }; };

test('the map has every kind, every value in 0..1', () => {
  const m = town();
  for (const k of KINDS) {
    assert.equal(m.cells[k].length, CELLS * CELLS);
    for (const v of m.cells[k]) assert.ok(v >= 0 && v <= 1, k);
  }
  assert.ok(Math.max(...m.cells.water) > 0.9 && Math.max(...m.cells.street) > 0.9 && Math.max(...m.cells.farm) > 0.9);
});

test('zoomed in, the place under the camera is what you hear', () => {
  const m = town();
  const street = hear(m, at(25, 48, 8));
  const river = hear(m, at(83, 30, 8));
  const farm = hear(m, at(11, 83, 8));
  assert.ok(street.gain.street > 0.6 && street.gain.water < 0.05, 'the street, not the river');
  assert.ok(river.gain.water > 0.6 && river.gain.street < 0.05, 'the river, not the street');
  assert.ok(farm.gain.farm > 0.6 && farm.gain.water < 0.05, 'the farm');
  assert.ok(street.gain.homes > 0, 'the cottage by the street');
});

test('zoomed out, places blend into a softer, muffled hum that does not go silent', () => {
  const m = town();
  const close = hear(m, at(83, 30, 8));
  const far = hear(m, at(68, 48, 42));
  assert.ok(far.muffle > 0.8 && close.muffle < 0.05);
  assert.ok(far.gain.water < close.gain.water, 'the river is softer from up high');
  assert.ok(far.gain.water > 0, 'but still there');
  assert.ok(far.gain.street > 0, 'the far street is in the blend too');
  assert.ok(closeness(8) === 1 && closeness(60) === 0 && closeness(NaN) === 0);
});

test('a sound to the right of the view leans right, gently, and turning around swaps sides', () => {
  const m = town();
  const l = at(76, 30, 8); // the river is east (+x) of the listener
  assert.deepEqual(rightOf(0), { x: 1, z: -0 });
  const facingNorth = hear(m, l, 0);      // az 0 looks along -z, so +x is to the right
  const facingSouth = hear(m, l, Math.PI);
  assert.ok(facingNorth.pan.water > 0.1, 'leans right');
  assert.ok(facingSouth.pan.water < -0.1, 'and left when turned around');
  for (const k of KINDS) assert.ok(Math.abs(facingNorth.pan[k]) <= HEAR.pan + 1e-9, 'never more than a gentle lean');
});

test('derived places, broken input and an empty map never give NaN', () => {
  const empty = buildSoundMap({});
  for (const r of [hear(empty, { x: 0, z: 0, h: 10 }), hear(town(), { x: NaN, z: undefined, h: NaN }, NaN), hear(null, null)]) {
    for (const k of [...KINDS, 'people', 'wild']) {
      assert.ok(Number.isFinite(r.gain[k]) && r.gain[k] >= 0 && r.gain[k] <= 1, k);
      assert.ok(Number.isFinite(r.pan[k]), k);
    }
    assert.ok(Number.isFinite(r.muffle));
  }
  assert.equal(headingOf({ mode: 'fly', view: { az: 1 }, free: { yaw: 2 } }), 2);
  assert.equal(headingOf({ mode: 'iso', view: { az: 1 }, free: null }), 1);
});

test('rain is a soft wash plus drips by the houses; farms and workshops keep daytime hours', () => {
  const wet = layersFor({ weather: 'rain' });
  assert.ok(wet.rain > 0 && wet.drips > 0 && wet.rain <= 0.75);
  assert.equal(LAYERS.drips.place, 'homes');
  assert.equal(layersFor({}).drips, 0, 'no drips in the dry');
  assert.ok(layersFor({}).farmyard > 0 && layersFor({ night: true }).farmyard === 0);
  assert.ok(layersFor({}).workshop > 0 && layersFor({ night: true }).workshop === 0);
});
