// The services overlay: a soft tint on the tiles a service or park reaches, and a stronger tint on the tiles of the
// building under the cursor. One plane, one draw call, drawn per pixel from a 64 x 64 data texture (like tileview).
//
// API for UI modules (scene.sys('services-overlay')):
//   show({ cover, focus })   cover and focus are lists of [gx, gz] tiles; cover tiles get the soft tint, focus tiles the stronger one.
//   clear()                  hides the overlay
import * as THREE from '../../../vendor/three/three.module.min.js';
import { GRID_N, tileIndex, inBounds } from '../../world/grid.js';
import { groundPlaneGeometry } from '../ground.js';

const AREA = GRID_N * GRID_N;

const VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = `
precision highp float;
uniform sampler2D uTiles;
uniform vec3 uCover, uFocus;
uniform float uNight;
varying vec3 vW;
const float N = 64.0;
vec4 over(vec4 base, vec4 s){
  float a = s.a + base.a * (1.0 - s.a);
  vec3 c = a > 0.0001 ? (s.rgb * s.a + base.rgb * base.a * (1.0 - s.a)) / a : vec3(0.0);
  return vec4(c, a);
}
void main(){
  vec2 t = (vW.xz + 97.5) / 3.0;
  vec2 id = floor(t), f = fract(t);
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) discard;
  vec4 d = texture2D(uTiles, (id + 0.5) / N);
  // soft tiles: the fill is a little lighter at the edge of each tile, so neighbours blend instead of forming a grid
  vec2 e = min(f, 1.0 - f);
  float soft = mix(0.55, 1.0, smoothstep(0.0, 0.3, min(e.x, e.y)));
  vec4 c = vec4(0.0);
  c = over(c, vec4(uCover, d.r * 0.26 * soft));
  c = over(c, vec4(uFocus, d.g * 0.42 * soft));
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
        uNight: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(groundPlaneGeometry(0.2), mat);
    mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.visible = false;
    world.add(mesh);
    let prev = [];           // indices written last time, so a clear only touches those
    let sig = '';

    function write(cover, focus) {
      const key = cover.map((t) => t.join(':')).join(';') + '|' + focus.map((t) => t.join(':')).join(';');
      if (key === sig) return;
      sig = key;
      for (const i of prev) { data[i * 4] = 0; data[i * 4 + 1] = 0; }
      prev = [];  // duplicates are harmless: clearing twice is a no-op
      for (const [gx, gz] of cover) if (inBounds(gx, gz)) { const i = tileIndex(gx, gz); data[i * 4] = 255; prev.push(i); }
      for (const [gx, gz] of focus) if (inBounds(gx, gz)) { const i = tileIndex(gx, gz); data[i * 4 + 1] = 255; prev.push(i); }
      tex.needsUpdate = true;
    }

    return {
      show({ cover = [], focus = [] } = {}) {
        write(cover, focus);
        mesh.visible = cover.length > 0 || focus.length > 0;
      },
      clear() { write([], []); mesh.visible = false; },
      setNight(on) { mat.uniforms.uNight.value = on ? 1 : 0; },
    };
  },
};
