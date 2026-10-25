// The services overlay: a soft tint on the tiles a service, park or shop reaches, a warm haze on the tiles industry eases,
// a stronger tint on the tiles of the building under the cursor, and a ripple that spreads when something is placed.
// One plane, one draw call, drawn per pixel from a data texture the size of the grid (like tileview). The ripple is part of the same
// shader, so it costs no draw call either.
//
// API for UI modules (scene.sys('services-overlay')):
//   show({ cover, focus, haze })  lists of [gx, gz] tiles. cover gets the soft blue tint, focus the stronger coral one,
//                                 haze the faint warm grey of industry. Any of them may be empty.
//   clear()                       hides the tints (a ripple still finishes)
//   ripple(gx, gz, tiles)         a soft ring spreads out from the tile centre (gx, gz, may be fractional) to `tiles` tiles away
import * as THREE from '../../../vendor/three/three.module.min.js';
import { GRID_N, GRID_HALF, TILE, tileIndex, inBounds } from '../../world/grid.js';
import { groundPlaneGeometry, refreshGroundPlane } from '../ground.js';
import { createLandWatch } from '../land-watch.js';

const AREA = GRID_N * GRID_N;
const RIPPLE_S = 1.1;      // seconds for a ripple to spread and fade
const RIPPLE_START = 0.5 * TILE;

const VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = `
precision highp float;
uniform sampler2D uTiles;
uniform vec3 uCover, uFocus, uHaze;
uniform float uNight;
uniform vec2 uRipC;
uniform float uRipR, uRipA;
varying vec3 vW;
const float N = ${GRID_N}.0;
vec4 over(vec4 base, vec4 s){
  float a = s.a + base.a * (1.0 - s.a);
  vec3 c = a > 0.0001 ? (s.rgb * s.a + base.rgb * base.a * (1.0 - s.a)) / a : vec3(0.0);
  return vec4(c, a);
}
void main(){
  vec2 t = (vW.xz + ${(GRID_HALF * TILE + TILE / 2).toFixed(1)}) / ${TILE.toFixed(1)};
  vec2 id = floor(t), f = fract(t);
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) discard;
  vec4 d = texture2D(uTiles, (id + 0.5) / N);
  // soft tiles: the fill is a little lighter at the edge of each tile, so neighbours blend instead of forming a grid
  vec2 e = min(f, 1.0 - f);
  float soft = mix(0.55, 1.0, smoothstep(0.0, 0.3, min(e.x, e.y)));
  vec4 c = vec4(0.0);
  c = over(c, vec4(uCover, d.r * 0.26 * soft));
  c = over(c, vec4(uHaze, d.b * 0.2 * soft));
  c = over(c, vec4(uFocus, d.g * 0.42 * soft));
  // the ripple: a thin ring that spreads out from a placement and fades as it goes
  float rd = distance(vW.xz, uRipC);
  float ring = (1.0 - smoothstep(0.0, 1.4, abs(rd - uRipR))) * uRipA;
  c = over(c, vec4(uCover, ring * 0.45));
  c.rgb *= 1.0 - 0.25 * uNight;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

export default {
  id: 'services-overlay',
  create({ world }) {
    const data = new Uint8Array(AREA * 4);
    const tex = new THREE.DataTexture(data, GRID_N, GRID_N, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTiles: { value: tex },
        uCover: { value: new THREE.Color('#8DBEDD') },   // civic blue: the accent, used for coverage only
        uFocus: { value: new THREE.Color('#E3A08E') },   // coral: the building under the cursor
        uHaze: { value: new THREE.Color('#A8998A') },    // warm grey: industry easing the streets around it
        uNight: { value: 0 },
        uRipC: { value: new THREE.Vector2() },
        uRipR: { value: RIPPLE_START },
        uRipA: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(groundPlaneGeometry(0.2), mat);
    const land = createLandWatch();
    mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.visible = false;
    world.add(mesh);
    let prev = [];           // indices written last time, so a clear only touches those
    let sig = '';
    let tinted = false;      // any tint on screen
    let rip = 1, ripMax = 0; // ripple progress 0..1 (1 = idle) and its outer radius in world units

    function write(cover, focus, haze) {
      const key = [cover, focus, haze].map((l) => l.map((t) => t.join(':')).join(';')).join('|');
      if (key === sig) return;
      sig = key;
      for (const i of prev) { data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; }
      prev = [];  // duplicates are harmless: clearing twice is a no-op
      for (const [gx, gz] of cover) if (inBounds(gx, gz)) { const i = tileIndex(gx, gz); data[i * 4] = 255; prev.push(i); }
      for (const [gx, gz] of focus) if (inBounds(gx, gz)) { const i = tileIndex(gx, gz); data[i * 4 + 1] = 255; prev.push(i); }
      for (const [gx, gz] of haze) if (inBounds(gx, gz)) { const i = tileIndex(gx, gz); data[i * 4 + 2] = 255; prev.push(i); }
      tex.needsUpdate = true;
    }

    // The mesh shows while there is a tint or a ripple to draw; otherwise it costs nothing.
    const sync = () => { mesh.visible = tinted || rip < 1; };

    return {
      show({ cover = [], focus = [], haze = [] } = {}) {
        write(cover, focus, haze);
        tinted = cover.length > 0 || focus.length > 0 || haze.length > 0;
        sync();
      },
      clear() { write([], [], []); tinted = false; sync(); },
      ripple(gx, gz, tiles) {
        mat.uniforms.uRipC.value.set((gx - GRID_HALF) * TILE, (gz - GRID_HALF) * TILE);
        ripMax = (tiles + 0.5) * TILE;
        rip = 0;
        sync();
      },
      // Per frame: moves the ripple outward. Idle (no ripple) it does nothing.
      frame(f) {
        if (land.poll()) refreshGroundPlane(mesh.geometry, 0.2); // the terrain tools moved the ground
        if (rip >= 1) return;
        rip = Math.min(1, rip + f.dt / RIPPLE_S);
        const ease = 1 - (1 - rip) * (1 - rip);
        mat.uniforms.uRipR.value = RIPPLE_START + (ripMax - RIPPLE_START) * ease;
        mat.uniforms.uRipA.value = 1 - rip;
        if (rip >= 1) mat.uniforms.uRipA.value = 0;
        sync();
      },
      setNight(on) { mat.uniforms.uNight.value = on ? 1 : 0; },
    };
  },
};
