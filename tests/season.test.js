import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { patchSeason, applySeason, SEASON } from '../src/render/season.js';
import { createSky } from '../src/render/sky.js';
import { createLighting } from '../src/render/night.js';
import weatherSystem from '../src/render/systems/weather.js';
import { DAY_LENGTHS, DEFAULTS, atmosphereTargets, seasonLengthS } from '../src/core/calendar.js';

// The patch is written against three's toon shader. If three renames these chunks, the season would silently stop.
test('the toon shader still has the chunks the season patch anchors on', () => {
  const frag = THREE.ShaderLib.toon.fragmentShader;
  assert.ok(frag.includes('#include <common>'));
  assert.ok(frag.includes('#include <normal_fragment_maps>'));
});

test('a patched toon material gets the season uniforms and only the switches it asked for', () => {
  const run = (opts) => {
    const mat = patchSeason(new THREE.MeshToonMaterial({ color: 0xffffff }), opts);
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
    mat.onBeforeCompile(shader);
    return { mat, shader, frag: shader.fragmentShader };
  };
  const canopy = run({ leaf: true, blossom: true });
  assert.equal(canopy.shader.uniforms.uSnow, SEASON.snow, 'the uniforms are shared, so one update reaches every material');
  assert.equal(canopy.shader.uniforms.uBlossom, SEASON.blossom);
  assert.ok(canopy.frag.includes('uniform float uSnow'));
  assert.ok(canopy.frag.includes('leafCol'), 'leaf surfaces take the foliage colour');
  assert.ok(canopy.frag.includes('uBlossom * (0.4'), 'and blossom on top');
  const pine = run({ leaf: true, foliage: 0 });
  assert.ok(pine.frag.includes('* 0.000'), 'conifers take no foliage colour');
  assert.ok(!pine.frag.includes('uBlossom * (0.4'), 'conifers do not blossom');
  const building = run({});
  assert.ok(!building.frag.includes('leafCol'), 'buildings and roads take no foliage colour');
  assert.ok(building.frag.includes('uSnowCol'), 'but they still take snow on top');
  const water = run({ still: true });
  assert.ok(water.frag.includes('uWaterCol'));
  assert.notEqual(canopy.mat.customProgramCacheKey(), building.mat.customProgramCacheKey(), 'variants compile apart');
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

// The per-season look, checked on the numbers the shader and the lights get. The shader maths is mirrored here on
// representative colours; the mirror is only as good as the GLSL it copies, so the GLSL anchors are tested above.
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const hex = (h) => new THREE.Color(h);
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// Mirror of the leaf branch: base mixed towards the season's foliage colour by its amount.
function leafLook(baseHex, t, hsh = 0.2) {
  const base = hex(baseHex);
  const lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
  const col = hex(t.foliageCol).lerp(hex(t.foliageAlt), t.autumn * (hsh > 0.55 ? 1 : 0));
  const tgt = new THREE.Color(Math.min(1, col.r * (0.8 + 0.4 * lum)), Math.min(1, col.g * (0.8 + 0.4 * lum)), Math.min(1, col.b * (0.8 + 0.4 * lum)));
  return base.clone().lerp(tgt, t.foliage);
}
const targetsFor = (season) => atmosphereTargets({ hour: 12, weather: 'clear', season });

test('each season changes the grass clearly from the others', () => {
  const base = 0x9DB874; // the sage of the land palette
  const looks = SEASON_NAMES.map((n) => leafLook(base, targetsFor(n), 0.2));
  for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) {
    assert.ok(dist(looks[i], looks[j]) > 0.08, SEASON_NAMES[i] + ' and ' + SEASON_NAMES[j] + ' look too alike on grass');
  }
  const summer = leafLook(base, targetsFor('summer'));
  assert.ok(dist(summer, hex(base)) > 0.02, 'summer is not just the plain sage: it is the warm, saturated green');
});

test('autumn splits the leaves between gold and red, and winter goes dormant', () => {
  const gold = leafLook(0x9DB874, targetsFor('autumn'), 0.2), red = leafLook(0x9DB874, targetsFor('autumn'), 0.7);
  assert.ok(dist(gold, red) > 0.05, 'some leaves are red, the rest gold');
  assert.ok(targetsFor('autumn').foliage > 0.7, 'autumn is the strongest foliage change (muted, but still the largest)');
  const winter = targetsFor('winter');
  assert.ok(winter.foliageCol !== targetsFor('summer').foliageCol && winter.cover >= 0.9, 'winter is dormant brown under snow');
});

test('fields, water, haze and sun all change with the season', () => {
  const T = SEASON_NAMES.map(targetsFor);
  for (const key of ['field', 'water', 'haze', 'sun']) {
    const vals = T.map((t) => t[key]);
    assert.equal(new Set(vals).size, 4, key + ' has four different colours');
  }
  const strengths = T.map((t) => t.strength);
  assert.ok(Math.max(...strengths) > Math.min(...strengths) + 0.3, 'the sun is stronger in summer than winter');
  assert.ok(T[3].dir[1] < T[1].dir[1], 'the winter sun sits lower, so shadows are longer');
});

test('spring has petals, autumn has a few leaves on the wind, summer and winter have neither', () => {
  assert.ok(targetsFor('spring').petals > 0);
  assert.equal(targetsFor('summer').petals, 0);
  assert.ok(targetsFor('autumn').leaves > 0 && targetsFor('autumn').leaves < 1, 'autumn leaves drift without a leaves roll');
  assert.equal(targetsFor('summer').leaves, 0);
  assert.equal(targetsFor('winter').petals, 0);
});

test('a season is two in-game days by default, so the changes come within the first session', () => {
  assert.equal(seasonLengthS(DEFAULTS), DAY_LENGTHS.normal * 9);
});

test('the land patch spreads the season in drifts and spares stone and cliffs', () => {
  const mat = patchSeason(new THREE.MeshToonMaterial({ color: 0xffffff }), { land: true });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.toon.vertexShader, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
  mat.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vSeasonPos = '), 'the vertex shader hands the world position over');
  assert.ok(shader.fragmentShader.includes('sNoise(vSeasonPos.xz'), 'drifts come from world-space noise');
  assert.ok(shader.fragmentShader.includes('greenish') && shader.fragmentShader.includes('levelGround'), 'stone and slopes are spared');
  assert.ok(!/\bfloat flat\b/.test(shader.fragmentShader), '"flat" is a GLSL keyword');
});

test('no skirt shares a wall with another, so the seam between fine and far ground cannot z-fight', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/render/terrain.js', import.meta.url), 'utf8');
  assert.equal((src.match(/skirt\((inner|outer), /g) || []).length, 1, 'only the fine ground hangs a wall on the seam');
});
