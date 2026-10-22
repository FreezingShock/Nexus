import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { patchSeason, applySeason, SEASON } from '../src/render/season.js';
import { createSky } from '../src/render/sky.js';
import { createLighting } from '../src/render/night.js';
import weatherSystem from '../src/render/systems/weather.js';
import { atmosphereTargets } from '../src/core/calendar.js';

// The patch is written against three's toon shader. If three renames these chunks, the season would silently stop.
test('the toon shader still has the chunks the season patch anchors on', () => {
  const frag = THREE.ShaderLib.toon.fragmentShader;
  assert.ok(frag.includes('#include <common>'));
  assert.ok(frag.includes('#include <normal_fragment_maps>'));
});

test('a patched toon material gets the season uniforms and its own foliage strength', () => {
  const mat = patchSeason(new THREE.MeshToonMaterial({ color: 0xffffff }), { foliage: 0.3, blossom: true });
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSnow, SEASON.snow, 'the uniforms are shared, so one update reaches every material');
  assert.equal(shader.uniforms.uBlossom, SEASON.blossom);
  assert.ok(shader.fragmentShader.includes('uniform float uSnow'));
  assert.ok(shader.fragmentShader.includes('* 0.300'), 'the conifer strength is baked in');
  assert.ok(shader.fragmentShader.includes('* 1.0)'), 'blossom is on for this variant');
  assert.notEqual(mat.customProgramCacheKey(), patchSeason(new THREE.MeshToonMaterial(), {}).customProgramCacheKey(), 'variants compile apart');
});

test('applySeason copies the eased sky into the shared uniforms', () => {
  const sky = createSky();
  const look = sky.update(0, atmosphereTargets({ hour: 12, weather: 'snow', season: 'winter' }));
  applySeason(look);
  assert.equal(SEASON.snow.value, 1);
  assert.ok(SEASON.foliage.value > 0, 'winter foliage is dormant, not gone');
  assert.equal(SEASON.wet.value, 0);
});

test('the sky snaps on its first update and eases after that', () => {
  const sky = createSky();
  const rain = atmosphereTargets({ hour: 12, weather: 'rain', season: 'autumn' });
  const clear = atmosphereTargets({ hour: 12, weather: 'clear', season: 'summer' });
  sky.update(0, rain);
  assert.equal(sky.cur.rain, 1, 'a loaded town starts in its real weather');
  sky.update(0.1, clear);
  assert.ok(sky.cur.rain > 0 && sky.cur.rain < 1, 'rain fades out over a few seconds');
  for (let i = 0; i < 100; i++) sky.update(0.1, clear); // 10 seconds
  assert.ok(sky.cur.rain < 0.001, 'rain is gone after 10 seconds');
  assert.ok(sky.cur.wet > 0.5, 'wet ground dries slowly, so the town stays shiny for a while');
  for (let i = 0; i < 600; i++) sky.update(0.1, clear); // a full minute more
  assert.ok(sky.cur.wet < 0.2, 'and nearly dry after a minute and a bit');
});

test('lighting follows the eased sky: the sun dims under cloud, and midnight is full night', () => {
  const dayLook = createSky().update(0, atmosphereTargets({ hour: 12, weather: 'clear', season: 'summer' }));
  const rainLook = createSky().update(0, atmosphereTargets({ hour: 12, weather: 'rain', season: 'summer' }));
  const nightLook = createSky().update(0, atmosphereTargets({ hour: 0, weather: 'clear', season: 'summer' }));
  const scene = new THREE.Scene();
  const lighting = createLighting(scene);
  const sun = scene.children.find((o) => o.isDirectionalLight);
  assert.equal(lighting.update(0, dayLook), 0, 'the night blend is zero at noon');
  const clearI = sun.intensity;
  lighting.update(0, rainLook);
  assert.ok(sun.intensity < clearI, 'rain dims the sun');
  assert.ok(scene.fog.near < 175, 'fog closes in under cloud');
  assert.equal(lighting.update(0, nightLook), 1, 'midnight is full night');
  assert.ok(sun.intensity < clearI, 'the moon is dimmer than the sun');
});

test('weather particles follow the eased weather and the Graphics effects setting', () => {
  const added = [];
  const world = { add: (...m) => added.push(...m) };
  const sys = weatherSystem.create({ world });
  const counts = () => added.map((m) => m.count);
  const sky = (over) => ({ rain: 0, snow: 0, leaves: 0, ...over });
  sys.frame({ dt: 0.1, t: 1, sky: sky({ rain: 1 }) });
  assert.ok(counts()[0] > 500, 'heavy rain fills most of the rain layer');
  assert.equal(added[1].visible, false, 'no snow falls in rain');
  sys.quality({ effects: 0 });
  sys.frame({ dt: 0.1, t: 1.1, sky: sky({ rain: 1, snow: 1 }) });
  assert.equal(added[0].count, 0, 'Low shows no particles');
  assert.equal(added[1].visible, false);
  sys.quality({ effects: 0.5 });
  sys.frame({ dt: 0.1, t: 1.2, sky: sky({ snow: 1 }) });
  assert.ok(added[1].count > 0 && added[1].count <= 520 / 2 + 1, 'light effects show about half the snow');
});
