import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createSky } from '../src/render/sky.js';
import { skyPalette, makePalette } from '../src/render/sky-look.js';
import skyDome from '../src/render/systems/sky.js';
import { atmosphereTargets } from '../src/core/calendar.js';

// The eased sky for a moment, snapped (the first update snaps), exactly as scene.js sees it.
function look({ hour = 12, weather = 'clear', season = 'summer' } = {}) {
  return createSky().update(0, atmosphereTargets({ hour, weather, season }));
}
const lum = (c) => c.r + c.g + c.b;
const sat = (c) => { const o = {}; c.getHSL(o); return o.s; };
const redShare = (c) => c.r / (c.r + c.g + c.b);
// The horizon colour the lighting sets: the fog colour. Any warm haze stands in for it here.
const HAZE = new THREE.Color(0xF1E6C8);

test('the sky is darker at night, with stars, and brighter by day with none', () => {
  const day = skyPalette(look({ hour: 12 }), HAZE);
  const night = skyPalette(look({ hour: 0 }), HAZE);
  assert.ok(lum(night.zenith) < lum(day.zenith) * 0.5, 'deep blue at night');
  assert.equal(day.stars, 0, 'no stars at noon');
  assert.ok(night.stars > 0.7, 'stars under a clear night sky');
});

test('the body is the sun by day and the moon at night, both from the existing light direction', () => {
  const day = look({ hour: 12 }), night = look({ hour: 0 });
  const p = skyPalette(day, HAZE), q = skyPalette(night, HAZE);
  assert.ok(Math.abs(p.bodyDir.length() - 1) < 1e-6, 'the body direction is a unit vector');
  assert.ok(p.bodyCol.r > p.bodyCol.b, 'the sun is warm');
  assert.ok(q.bodyCol.b >= q.bodyCol.r, 'the moon is cool');
  assert.ok(q.bodyGlow < p.bodyGlow, 'the moon glows less than the sun');
});

test('dawn is peach, dusk is rose: the evening zenith carries more red than the morning one', () => {
  const dusk = look({ hour: 18 });
  const morning = skyPalette(dusk, HAZE, 0), evening = skyPalette(dusk, HAZE, 1);
  assert.ok(redShare(evening.zenith) > redShare(morning.zenith), 'evening leans rose');
  const dawn = skyPalette(look({ hour: 6 }), HAZE, 0);
  assert.ok(dawn.cloudLit.r > dawn.cloudLit.b, 'clouds take the warm light at dawn');
});

test('overcast and rain grey the sky and fill the cover; fair weather keeps some puffs', () => {
  const clear = skyPalette(look({ hour: 12, weather: 'clear' }), HAZE);
  const rain = skyPalette(look({ hour: 12, weather: 'rain', season: 'autumn' }), HAZE);
  assert.ok(sat(rain.zenith) < sat(clear.zenith), 'rain sky is greyer');
  assert.ok(rain.cover > clear.cover, 'rain covers more of the sky');
  assert.ok(clear.cover > 0.2 && clear.cover < 0.3, 'clear weather keeps a fair-weather cover');
  assert.ok(rain.cover <= 1);
});

test('snow sky is cold and cloud hides the sun and stars', () => {
  const snow = skyPalette(look({ hour: 12, weather: 'snow', season: 'winter' }), HAZE);
  assert.ok(snow.zenith.b >= snow.zenith.r, 'winter sky is cold');
  const overcastNight = skyPalette(look({ hour: 0, weather: 'rain' }), HAZE);
  const clearNight = skyPalette(look({ hour: 0 }), HAZE);
  assert.ok(overcastNight.stars < clearNight.stars * 0.2, 'rain hides the stars');
});

test('fog flattens the sky towards the haze', () => {
  const fog = skyPalette(look({ hour: 12, weather: 'fog' }), HAZE);
  const clear = skyPalette(look({ hour: 12 }), HAZE);
  assert.ok(fog.flat > 0.9 && clear.flat === 0);
});

test('the palette fills one reused object, so a frame allocates nothing', () => {
  const out = makePalette();
  const a = skyPalette(look({ hour: 12 }), HAZE, 0, out);
  const b = skyPalette(look({ hour: 0 }), HAZE, 1, out);
  assert.equal(a, out);
  assert.equal(b, out);
});

// The dome itself, driven the way scene.js drives it: one frame per state, then the quality hook.
function dome() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xF1E6C8, 175, 340);
  const hooks = skyDome.create({ scene });
  const mesh = scene.children.find((o) => o.material && o.material.isShaderMaterial);
  return { hooks, scene, mesh, u: mesh.material.uniforms };
}
const frame = (hooks, { hour = 12, weather = 'clear', season = 'summer', t = 1 } = {}) =>
  hooks.frame({ dt: 0.016, t, simDt: 0.016, state: { hour }, sky: look({ hour, weather, season }) });

test('the dome is one camera-following draw: behind the town, no depth write, drawn last', () => {
  const { mesh } = dome();
  assert.ok(mesh, 'the sky is a mesh in the scene');
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.side, THREE.BackSide);
  assert.equal(mesh.frustumCulled, false);
  assert.ok(mesh.renderOrder > 0, 'after the opaque town');
  assert.ok(mesh.material.vertexShader.includes('cameraPosition'), 'the sphere follows whichever camera draws it');
  assert.ok(mesh.material.vertexShader.includes('gl_Position.z = gl_Position.w'), 'the sky sits at the far end of the depth range');
});

test('a frame sets the dome uniforms from the eased sky and the day cycle', () => {
  const { hooks, u } = dome();
  frame(hooks, { hour: 0 });
  assert.ok(u.uStars.value > 0.7, 'stars at night');
  assert.ok(u.uBodyCol.value.b >= u.uBodyCol.value.r, 'the moon is cool');
  frame(hooks, { hour: 12 });
  assert.ok(u.uStars.value < 0.001, 'stars fade out by day');
  assert.ok(Math.abs(u.uBodyDir.value.length() - 1) < 1e-6);
});

test('Graphics: Off draws no clouds, Light two octaves, Full four', () => {
  const { hooks, u } = dome();
  hooks.quality({ effects: 0 });
  assert.equal(u.uClouds.value, 0);
  hooks.quality({ effects: 0.5 });
  assert.equal(u.uClouds.value, 1);
  assert.equal(u.uOct.value, 2, 'Low gets simpler clouds');
  hooks.quality({ effects: 1 });
  assert.equal(u.uOct.value, 4);
});

test('the shader has the parts the palette feeds: horizon, zenith, body, stars and clouds', () => {
  const { mesh } = dome();
  const frag = mesh.material.fragmentShader;
  for (const name of ['uZenith', 'uHorizon', 'uBodyDir', 'uStars', 'uCover', 'uOct', 'uClouds', 'uTime']) {
    assert.ok(frag.includes(name), name + ' is used in the fragment shader');
    assert.ok(name in mesh.material.uniforms, name + ' is a uniform');
  }
});
