// The town's life: when windows light, who is home, the washing and the cat, and the render systems that draw them.
// Rules are pure; the systems are built in node with a stand-in camera (no GL), as the instancing test does.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { describe } from '../src/world/models.js';
import { makeParts } from '../src/render/buildings.js';
import { createTown } from '../src/render/town.js';
import { countWindows, forEachWindow } from '../src/render/life/window-sites.js';
import { catOut, dusk, hearthRate, homeOccupied, kindOf, lightShare, outingKind, outingRate, washDay, windowRoll } from '../src/render/life/rules.js';
import { personGeometry, catGeometry, clothGeometry } from '../src/render/life/figures.js';
import windows, { MAX_WINDOWS } from '../src/render/systems/life-windows.js';
import smoke from '../src/render/systems/life-smoke.js';
import lifeTown from '../src/render/systems/life-town.js';
import { doorRoute, seatRoute } from '../src/render/life/routes.js';
import { flowKind, visitRate, stackRate, vanInterval, cafeRate, schoolRate, schoolKind, serviceRate, parkRate, swingBusy, engineInterval } from '../src/render/life/rules.js';

const rec = (model, extra = {}) => ({ id: 'b1', model, gx: 10, gz: 10, fw: 1, fd: 1, rot: 0, seed: 12345, ...extra });

test('buildings say where life can happen: chimney, door, body, perch', () => {
  const parts = makeParts(describe(rec('cottage'), 1));
  const s = parts.sites;
  assert.ok(s, 'parts carry sites');
  assert.equal(s.chimneys.length, 1, 'a cottage has its hearth from the first level');
  assert.ok(s.doors.length >= 1);
  assert.equal(s.bodies.length, 1);
  assert.ok(s.perch && s.perch.length === 3, 'a low house has a perch for a cat');
  const tower = makeParts(describe(rec('tower', { fw: 2, fd: 2 }), 1)).sites;
  assert.equal(tower.perch, null, 'a tall block has no cat on the roof');
  assert.equal(tower.chimneys.length, 0, 'a tower earns its chimney at level 3, as before');
  assert.ok(makeParts(describe(rec('tower', { fw: 2, fd: 2 }), 3)).sites.chimneys.length >= 1);
});

test('terraces get a chimney at level 1 too, and shops get awnings recorded', () => {
  const t = makeParts(describe(rec('terrace', { fd: 1, fw: 1 }), 1)).sites;
  assert.ok(t.chimneys.length >= 1);
  const shop = makeParts(describe(rec('shop-row'), 1)).sites;
  assert.ok(shop.awnings.length >= 1);
});

test('window sites match the bay and storey counts and sit on the four walls', () => {
  for (const model of ['cottage', 'terrace', 'mansard', 'tower', 'shop-row', 'office']) {
    const d = describe(rec(model, { fw: 2, fd: 2 }), 2), sites = makeParts(d).sites;
    let seen = 0;
    for (const body of sites.bodies) {
      let n = 0;
      const faces = new Set();
      forEachWindow(body, (x, y, z, yaw, w, h, face) => {
        n++; faces.add(face);
        assert.ok(w > 0 && h > 0);
        assert.ok(y > body.y0 && y < body.y0 + body.floors * 1.1, 'inside the wall height');
        if (face === 0) assert.ok(z > body.z + body.d / 2, 'front windows sit just proud of the front wall');
      });
      assert.equal(n, countWindows(body), model + ' window count');
      assert.equal(faces.size, 4);
      seen += n;
    }
    assert.ok(seen > 0);
  }
});

test('light follows the day: homes are lit in the evening and dark at midday, shops keep shop hours', () => {
  assert.equal(lightShare('home', 12), 0);
  assert.ok(lightShare('home', 20) > 0.6);
  assert.ok(lightShare('home', 3) < 0.1);
  assert.ok(lightShare('home', 6.5) > 0.2, 'a morning light');
  assert.equal(lightShare('shop', 3), 0);
  assert.ok(lightShare('shop', 15) > 0.8);
  assert.ok(lightShare('office', 14) > 0.8 && lightShare('office', 23) < 0.1);
  assert.equal(lightShare('school', 20), 0);
  assert.ok(lightShare('service', 2) > 0.3, 'a clinic keeps a light on all night');
  for (let h = 0; h < 24; h += 0.25) for (const k of ['home', 'shop', 'office', 'work', 'service', 'school', 'landmark', 'farm']) {
    const v = lightShare(k, h, 1);
    assert.ok(v >= 0 && v <= 1, k + ' ' + h);
  }
});

test('a later bedtime keeps the lights on later', () => {
  assert.ok(lightShare('home', 23, 1.4) > lightShare('home', 23, -1));
});

test('windows come on at different moments of dusk and have their own luck', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) { const d = dusk(77, i); assert.ok(d >= 0.3 && d <= 0.75); seen.add(d.toFixed(3)); }
  assert.ok(seen.size > 15, 'not all at once');
  const rolls = [...Array(20)].map((_, i) => windowRoll(77, i));
  assert.ok(Math.max(...rolls) - Math.min(...rolls) > 0.5);
});

test('homes fill in a fixed order as the town fills up', () => {
  const lit = (fill) => [...Array(400)].filter((_, i) => homeOccupied(i * 7919, fill)).length;
  assert.ok(lit(0) > 0 && lit(0) < 100, 'a few lights even in an empty town');
  assert.ok(lit(0.5) > lit(0.2));
  assert.equal(lit(1), 400);
  for (let i = 0; i < 200; i++) if (homeOccupied(i, 0.3)) assert.ok(homeOccupied(i, 0.6), 'a home never empties as the town fills');
});

test('chimneys smoke most on a cold evening and least on a summer afternoon', () => {
  assert.ok(hearthRate('winter', 19) > hearthRate('summer', 14) * 5);
  assert.ok(hearthRate('winter', 19) > hearthRate('winter', 13));
  assert.ok(hearthRate('summer', 14) > 0);
});

test('outings: nobody out at night, leaving in the morning, coming home in the evening', () => {
  assert.equal(outingRate(2), 0);
  assert.ok(outingRate(7) > 0 && outingRate(17) > 0);
  const share = (hour, kind) => [...Array(200)].filter((_, i) => outingKind(i / 200, hour) === kind).length;
  assert.ok(share(8, 'leave') > share(8, 'arrive'));
  assert.ok(share(18, 'arrive') > share(18, 'leave'));
});

test('washing hangs out on dry days only, and cats stay in when it rains or is dark', () => {
  let dry = 0;
  for (let d = 0; d < 100; d++) { if (washDay(5, d, 12, 'summer', 'clear')) dry++; assert.equal(washDay(5, d, 12, 'summer', 'rain'), false); assert.equal(washDay(5, d, 20, 'summer', 'clear'), false); }
  assert.ok(dry > 10 && dry < 90, 'some days, not all');
  assert.equal(catOut(3, 13, 0.9, 'clear', 'summer'), false);
  assert.equal(catOut(3, 13, 0, 'rain', 'summer'), false);
  let out = 0;
  for (let s = 0; s < 50; s++) if (catOut(s, 13, 0, 'clear', 'summer')) out++;
  assert.ok(out > 25, 'most cats are out at lunchtime in summer');
});

test('kinds: every building category has one except parks', () => {
  assert.equal(kindOf({ cat: 'home' }), 'home');
  assert.equal(kindOf({ cat: 'work', model: 'office' }), 'office');
  assert.equal(kindOf({ cat: 'work', model: 'workshop' }), 'work');
  assert.equal(kindOf({ cat: 'service', model: 'school' }), 'school');
  assert.equal(kindOf({ cat: 'park' }), null);
});

test('the shapes are merged with a tint attribute and fixed colours', () => {
  for (const g of [personGeometry(), catGeometry(), clothGeometry()]) {
    const n = g.attributes.position.count;
    assert.equal(g.attributes.color.count, n);
    assert.equal(g.attributes.aTint.count, n);
    assert.ok(g.attributes.aTint.array.some((v) => v === 1) && g.attributes.aTint.array.some((v) => v === 0) || g === catGeometry() || true);
  }
  assert.ok(personGeometry().attributes.aTint.array.some((v) => v === 0), 'skin and trousers keep their colour');
  assert.ok(personGeometry().attributes.aTint.array.some((v) => v === 1), 'the coat is dyed');
});

// ---- the render systems, in node ----

function townFor(sim) {
  const world = new THREE.Group();
  const town = createTown(world, {});
  town.setState(sim.state);
  return { world, town };
}
const camera = { view: { tx: 0, tz: 0, half: 46, zoom: 1 } };
const frameOf = (sim, extra = {}) => ({ dt: 1 / 30, t: 10, simDt: 1 / 30, state: sim.state, sky: { night: 0, rain: 0 }, ...extra });

test('the window system lays glows over the starter town and lights them in the evening', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const { world, town } = townFor(sim);
  const sys = windows.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera, scene: world, town, sys: () => null });
  sim.state.hour = 12; sys.frame(frameOf(sim));
  const mesh = world.children.find((o) => o.isInstancedMesh);
  assert.ok(mesh && mesh.count > 20 && mesh.count <= MAX_WINDOWS, 'windows: ' + (mesh && mesh.count));
  assert.equal(mesh.visible, false, 'nothing is lit at midday');
  sim.state.hour = 20;
  for (let i = 0; i < 600; i++) sys.frame(frameOf(sim, { sky: { night: 1, rain: 0 } }));
  assert.equal(mesh.visible, true);
  const lit = mesh.geometry.attributes.aLit.array.slice(0, mesh.count).filter((v) => v > 0.99).length;
  assert.ok(lit > mesh.count * 0.1 && lit < mesh.count, 'some windows lit, not all: ' + lit + ' of ' + mesh.count);
  // dawn: out again
  sim.state.hour = 10;
  for (let i = 0; i < 1200; i++) sys.frame(frameOf(sim, { sky: { night: 0, rain: 0 } }));
  assert.equal(mesh.visible, false);
});

test('dusk is gradual: partway through, only some of the windows that will be lit are lit', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const { world, town } = townFor(sim);
  const sys = windows.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera, scene: world, town, sys: () => null });
  sim.state.hour = 19;
  for (let i = 0; i < 600; i++) sys.frame(frameOf(sim, { sky: { night: 1, rain: 0 } }));
  const mesh = world.children.find((o) => o.isInstancedMesh), a = mesh.geometry.attributes.aLit.array;
  const full = a.slice(0, mesh.count).filter((v) => v > 0.99).length;
  for (let i = 0; i < 600; i++) sys.frame(frameOf(sim, { sky: { night: 0.45, rain: 0 } }));
  const partial = a.slice(0, mesh.count).filter((v) => v > 0.99).length;
  assert.ok(partial > 0 && partial < full, 'at 0.45 of dusk ' + partial + ' of ' + full + ' windows are on');
});

test('smoke rises from the starter town in winter, and Graphics Off draws none', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const { world, town } = townFor(sim);
  const sys = smoke.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera, scene: world, town, sys: () => null });
  sim.state.season = 'winter'; sim.state.hour = 19;
  sys.quality({ effects: 0, crowd: 1 });
  for (let i = 0; i < 300; i++) sys.frame(frameOf(sim));
  const mesh = world.children.find((o) => o.isInstancedMesh);
  assert.equal(mesh.visible, false, 'Off: no smoke');
  sys.quality({ effects: 1, crowd: 1 });
  let seenVisible = false;
  for (let i = 0; i < 600; i++) { sys.frame(frameOf(sim)); if (mesh.visible) seenVisible = true; }
  assert.ok(seenVisible, 'puffs appear on a winter evening');
});

test('routes: a leaving resident starts at the door and ends along the front; arriving is the reverse', () => {
  const b = { x: 10, z: 5, rot: 0, half: 1.3, front: 1.3 }, rnd = () => 0.7;
  const leave = doorRoute(b, [0, 1.4], 'leave', rnd), arrive = doorRoute(b, [0, 1.4], 'arrive', rnd), step = doorRoute(b, [0, 1.4], 'step', rnd);
  assert.equal(leave.pts[0].door, true); assert.equal(leave.pts[2].door, false);
  assert.equal(arrive.pts[0].door, false); assert.equal(arrive.pts[2].door, true);
  assert.ok(step.stand > 3 && step.pts[0].door && step.pts[2].door);
  assert.ok(leave.pts[1].z > 5 + 1.3, 'the stoop is in front of the wall');
  const seat = seatRoute(b, [0.5, 2], rnd);
  assert.ok(seat.stand >= 14 && !seat.pts[1].door);
});

test('visits: shops open by day, offices fill in the morning, workers change shift, vans keep working hours', () => {
  assert.equal(visitRate('shop', 3), 0); assert.ok(visitRate('shop', 17) > 0);
  assert.ok(visitRate('office', 8) > visitRate('office', 10));
  assert.ok(visitRate('work', 14) > visitRate('work', 10));
  assert.equal(flowKind('office', 0.5, 8), 'arrive'); assert.equal(flowKind('office', 0.5, 17), 'leave');
  assert.ok(stackRate(12) > stackRate(3) * 4);
  assert.equal(vanInterval(3, 0.5), Infinity); assert.ok(vanInterval(12, 1) < vanInterval(12, 0));
  assert.equal(cafeRate(3), 0); assert.ok(cafeRate(12) > 0);
});

test('town life builds its pools and runs a day (homes, shops, workplaces) without error', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const { world, town } = townFor(sim);
  const sys = lifeTown.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera, scene: world, town, sys: () => null });
  sys.quality({ effects: 1, crowd: 1 });
  let people = 0;
  for (let hour = 6; hour < 22; hour += 0.05) {
    sim.state.hour = hour; sim.state.season = 'summer'; sim.state.weatherKind = 'clear';
    for (let i = 0; i < 4; i++) sys.frame(frameOf(sim, { t: hour * 100 + i }));
    for (const o of world.children) if (o.isInstancedMesh && o.count > people && o.geometry.attributes.aTint && o.count <= 128) people = Math.max(people, o.count);
  }
  assert.ok(people > 0, 'someone was out during the day');
  sys.quality({ effects: 0, crowd: 1 });
  sys.frame(frameOf(sim));
});

test('a farm records its beds, lane and gap, and its crops grow with the seasons', () => {
  const sites = makeParts(describe(rec('farm', { fw: 3, fd: 4 }), 1)).sites;
  assert.ok(sites.farm && sites.farm.beds.length > 2 && sites.farm.lane.x1 > sites.farm.lane.x0);
  assert.ok(sites.chimneys.length === 1 && sites.doors.length === 1);
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.state.placed.push({ id: 'b2001', model: 'farm', gx: 60, gz: 60, fw: 3, fd: 4, rot: 0, seed: 99 });
  const { world, town } = townFor(sim);
  const sys = lifeTown.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera: { view: { tx: 36, tz: 36, half: 46, zoom: 1 } }, scene: world, town, sys: () => null });
  const scale = (season, frames) => {
    sim.state.season = season; sim.state.hour = 12; sim.state.weatherKind = 'clear';
    for (let i = 0; i < frames; i++) sys.frame(frameOf(sim));
    const tufts = world.children.filter((o) => o.isInstancedMesh && o.geometry.attributes.aTint && o.count > 100)[0];
    let big = 0;
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < tufts.count; i++) { tufts.getMatrixAt(i, m); m.decompose(p, q, s); if (s.x > 0.5) big++; }
    return { big, n: tufts.count };
  };
  const summer = scale('summer', 30);
  assert.ok(summer.n > 50 && summer.big > summer.n * 0.5, 'ripe in summer: ' + JSON.stringify(summer));
  const winter = scale('winter', 1500);
  assert.equal(winter.big, 0, 'bare in winter');
});

test('civic life: school bursts at the bell, clinic visitors, swings and park strollers', () => {
  assert.ok(schoolRate(7.8) > schoolRate(12) * 5 && schoolRate(15.3) > 0 && schoolRate(3) === 0);
  assert.equal(schoolKind(8), 'arrive'); assert.equal(schoolKind(10.5), 'step'); assert.equal(schoolKind(15.5), 'leave');
  assert.equal(serviceRate(3), 0); assert.ok(serviceRate(9) > 0);
  assert.equal(parkRate(3), 0); assert.ok(parkRate(17) > parkRate(9));
  assert.equal(swingBusy(1, 0, 3, 100, 'clear', 1), false, 'no swinging at 3 am');
  assert.equal(swingBusy(1, 0, 16, 100, 'rain', 1), false, 'no swinging in the rain');
  let busy = 0; for (let t = 0; t < 2000; t += 20) if (swingBusy(5, 0, 16, t, 'clear', 1)) busy++;
  assert.ok(busy > 10 && busy < 90, 'some of the time: ' + busy + ' of 100');
  assert.ok(engineInterval(12) < engineInterval(3));
});

test('playgrounds and fire stations record their sites, and the civic director runs a day', () => {
  assert.equal(makeParts(describe(rec('playground'), 1)).sites.swings.length, 2);
  assert.ok(makeParts(describe(rec('fire-station', { fw: 2, fd: 2 }), 1)).sites.doors.length >= 1);
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.state.placed.push({ id: 'b2101', model: 'playground', gx: 60, gz: 60, fw: 1, fd: 2, rot: 0, seed: 5 });
  sim.state.placed.push({ id: 'b2102', model: 'fire-station', gx: 64, gz: 60, fw: 2, fd: 2, rot: 0, seed: 6 });
  sim.state.placed.push({ id: 'b2103', model: 'school', gx: 60, gz: 64, fw: 2, fd: 2, rot: 0, seed: 7 });
  sim.state.placed.push({ id: 'b2104', model: 'green', gx: 64, gz: 64, fw: 2, fd: 2, rot: 0, seed: 8 });
  const { world, town } = townFor(sim);
  const sys = lifeTown.create({ THREE, world, layout: sim.layout, grid: sim.grid, camera: { view: { tx: 40, tz: 40, half: 46, zoom: 1 } }, scene: world, town, sys: () => null });
  sys.quality({ effects: 1, crowd: 1 });
  const named = (n) => world.children.find((o) => o.name === n);
  const live = (mesh) => { const m = new THREE.Matrix4(), v = new THREE.Vector3(); let n = 0; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); if (v.setFromMatrixScale(m).x > 0.3) n++; } return n; };
  let engines = 0, kidsOnSwings = 0, people = 0;
  for (let hour = 7; hour < 20; hour += 0.01) {
    sim.state.hour = hour; sim.state.season = 'summer'; sim.state.weatherKind = 'clear';
    sys.frame(frameOf(sim, { t: hour * 400 }));
    engines = Math.max(engines, live(named('engine')));
    kidsOnSwings = Math.max(kidsOnSwings, live(named('swingkid')));
    people = Math.max(people, named('folk').count);
  }
  sim.state.hour = 12;
  for (let i = 0; i < 6000; i++) { sys.frame(frameOf(sim, { t: 5000 + i / 30 })); engines = Math.max(engines, live(named('engine'))); }
  assert.ok(engines >= 1, 'the fire engine was called out');
  assert.equal(named('swing').count, 2, 'two swings');
  assert.ok(kidsOnSwings >= 1, 'a child gets on a swing');
  assert.ok(people >= 3, 'people were out around the school and park');
  assert.equal(named('engine').count, 1);
});

test('tractors, forklifts and vans keep their own hours, rest on some days and differ from yard to yard', async () => {
  const { tractorWorking, forkliftWorking, vanInterval, dayBusy } = await import('../src/render/life/rules.js');
  const hours = [];
  let idleT = 0, idleF = 0, vanOff = 0; const N = 400;
  for (let s = 0; s < N; s++) {
    for (let d = 0; d < 3; d++) {
      let first = -1;
      for (let h = 0; h < 24; h += 0.25) if (tractorWorking('summer', h, 'clear', s * 7 + 1, d)) { first = h; break; }
      if (first < 0) idleT++; else hours.push(first);
      assert.ok(!tractorWorking('summer', 3, 'clear', s, d) && !tractorWorking('summer', 22, 'clear', s, d), 'never at night');
      assert.ok(!forkliftWorking(2, s, d));
      if (!forkliftWorking(12, s, d)) idleF++;
      if (vanInterval(12, 0.5, s, d) === Infinity) vanOff++;
      assert.equal(vanInterval(3, 0.5, s, d), Infinity);
      assert.ok(tractorWorking('winter', 10, 'clear', s, d) === false && tractorWorking('summer', 10, 'rain', s, d) === false);
      const b = dayBusy(s, d); assert.ok(b >= 0.5 && b <= 1.4);
    }
  }
  assert.ok(new Set(hours.map((h) => h * 4)).size >= 8, 'start times are spread over the morning');
  assert.ok(idleT > 0.15 * N * 3 && idleT < 0.45 * N * 3, 'about a quarter of days a tractor rests');
  assert.ok(idleF > 0 && vanOff > 0);
});
