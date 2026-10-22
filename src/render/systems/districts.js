// Districts on the map: a soft colour wash on each painted tile (one plane, one shader, a data texture the size of the grid),
// a thin border where two districts meet, and a little flag on a pole over each district's middle.
// Flags are instanced: three meshes in all (poles, and the two halves of the cloth). Labels are projected here and
// drawn as DOM by the Districts UI module (scene.sys('districts').labels()).
//
// Reads grid.district and state.districts; writes nothing. Draw calls: 4 (wash, poles, cloth x2).
import * as THREE from '../../../vendor/three/three.module.min.js';
import { GRID_N, tileCenter } from '../../world/grid.js';
import { DISTRICT_COLORS, FLAG_STYLES, MAX_DISTRICTS, districtAnchors, flagColor } from '../../world/districts.js';
import { groundPlaneGeometry } from '../ground.js';
import { toonUncached } from '../materials.js';
import { heightAt } from '../../world/terrain.js';

const AREA = GRID_N * GRID_N;
const POLE = 6.2;      // flags fly above most roofs
const CLOTH_W = 1.6, CLOTH_H = 1.0;

// Where each half of the cloth sits, in flag space (x runs out from the pole, y down from the top).
// Each style splits the flag differently; every part is one instance of a unit quad.
// The 'b' part sits a hair in front of 'a' so the band and emblem show on top.
const PARTS = [
  { a: { ox: 0, oy: 0, w: 0.8, h: 1, dz: 0 }, b: { ox: 0.8, oy: 0, w: 0.8, h: 1, dz: 0 } },              // side by side
  { a: { ox: 0, oy: 0, w: 1.6, h: 0.5, dz: 0 }, b: { ox: 0, oy: -0.5, w: 1.6, h: 0.5, dz: 0 } },        // stacked
  { a: { ox: 0, oy: 0, w: 1.6, h: 1, dz: 0 }, b: { ox: 0.55, oy: 0, w: 0.5, h: 1, dz: 0.01 } },          // centre band
  { a: { ox: 0, oy: 0, w: 1.6, h: 1, dz: 0 }, b: { ox: 0.55, oy: -0.25, w: 0.5, h: 0.5, dz: 0.01 } },   // emblem
];

const VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// Tile texel: rgb = the district's colour, a = its slot / 255 (0 = no district). Borders are drawn where the slot changes.
const FRAG = `
precision highp float;
uniform sampler2D uTiles;
uniform float uNight;
varying vec3 vW;
const float N = ${GRID_N}.0;
vec4 tile(vec2 id){
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) return vec4(0.0);
  return texture2D(uTiles, (id + 0.5) / N);
}
void main(){
  vec2 t = (vW.xz + 97.5) / 3.0;
  vec2 id = floor(t), f = fract(t);
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) discard;
  vec4 c = tile(id);
  if (c.a < 0.001) discard;
  // the edge we are nearest to, and the tile across it
  vec2 side = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
  vec2 dist = vec2(f.x < 0.5 ? f.x : 1.0 - f.x, f.y < 0.5 ? f.y : 1.0 - f.y);
  float bx = (tile(id + vec2(side.x, 0.0)).a != c.a && dist.x < 0.075) ? 1.0 : 0.0;
  float bz = (tile(id + vec2(0.0, side.y)).a != c.a && dist.y < 0.075) ? 1.0 : 0.0;
  float line = max(bx, bz);
  // soft wash: a little lighter toward the tile edge, so neighbours blend
  float soft = mix(0.7, 1.0, smoothstep(0.0, 0.3, min(dist.x, dist.y)));
  vec3 ink = vec3(0.17, 0.15, 0.125);
  vec3 col = mix(c.rgb, ink, 0.45 * line);
  float alpha = mix(0.2 * soft, 0.5, line);
  col *= 1.0 - 0.25 * uNight;
  gl_FragColor = vec4(col, alpha);
}`;

const hexRGB = (hex) => new THREE.Color(hex);

export default {
  id: 'districts',
  create({ world, grid }) {
    // ---- wash ----
    const data = new Uint8Array(AREA * 4);
    const tex = new THREE.DataTexture(data, GRID_N, GRID_N, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const washMat = new THREE.ShaderMaterial({
      uniforms: { uTiles: { value: tex }, uNight: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const wash = new THREE.Mesh(groundPlaneGeometry(0.22), washMat);
    wash.renderOrder = 2; wash.frustumCulled = false; wash.visible = false;
    world.add(wash);

    // ---- flags ----
    const poleGeo = new THREE.BoxGeometry(0.14, POLE, 0.14).translate(0, POLE / 2, 0);
    const poleMat = toonUncached(0xffffff);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, MAX_DISTRICTS);
    const clothGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
    const clothMat = toonUncached(0xffffff, { side: THREE.DoubleSide });
    const clothA = new THREE.InstancedMesh(clothGeo, clothMat, MAX_DISTRICTS);
    const clothB = new THREE.InstancedMesh(clothGeo, clothMat, MAX_DISTRICTS);
    for (const m of [poles, clothA, clothB]) {
      m.frustumCulled = false; m.count = 0; m.visible = false;
      m.castShadow = m.receiveShadow = false;
      world.add(m);
    }
    const POLE_COL = hexRGB('#6B5A46');
    for (let k = 0; k < MAX_DISTRICTS; k++) poles.setColorAt(k, POLE_COL);

    const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0), base = new THREE.Matrix4(), off = new THREE.Matrix4(), size = new THREE.Matrix4();
    const proj = new THREE.Vector3();

    let anchors = [];          // [{ slot, x, y, z, style, colA, colB }] for the districts that have tiles
    let lastTiles = new Uint8Array(AREA);
    let lastSig = '';

    // Rewrites the wash texture from the grid. Called when tiles or colours change.
    function writeWash(state) {
      const colorOf = new Map(state.districts.map((d) => [d.slot, flagColor(d)]));
      for (let i = 0; i < AREA; i++) {
        const s = grid.district[i];
        const o = i * 4;
        if (!s) { data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0; continue; }
        const c = new THREE.Color(colorOf.get(s) || '#FFFFFF');
        data[o] = Math.round(c.r * 255); data[o + 1] = Math.round(c.g * 255); data[o + 2] = Math.round(c.b * 255); data[o + 3] = s;
      }
      tex.needsUpdate = true;
    }

    // Recomputes anchors and flag transforms (positions only; the flutter happens each frame).
    function layoutFlags(state) {
      const found = districtAnchors(grid);
      anchors = [];
      for (const d of state.districts) {
        const a = found.get(d.slot);
        if (!a) continue;
        const [x, z] = tileCenter(a.gx, a.gz);
        const y = Math.max(0.1, heightAt(x, z));
        const colA = flagColor(d), colB = DISTRICT_COLORS[((d.pal || 0) + 3) % DISTRICT_COLORS.length];
        anchors.push({ slot: d.slot, x, y, z, style: (d.style || 0) % FLAG_STYLES, colA, colB });
      }
      poles.count = clothA.count = clothB.count = anchors.length;
      anchors.forEach((a, k) => {
        pos.set(a.x, a.y, a.z);
        mtx.compose(pos, quat.identity(), scl);
        poles.setMatrixAt(k, mtx);
        clothA.setColorAt(k, hexRGB(a.colA));
        clothB.setColorAt(k, hexRGB(a.colB));
      });
      for (const m of [poles, clothA, clothB]) {
        m.visible = anchors.length > 0;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }

    // A slow sway for each flag, so the cloth moves in a breeze and the town looks alive. Cheap: at most 15 flags.
    function flutter(t) {
      anchors.forEach((a, k) => {
        const sway = Math.sin(t * 2.1 + a.slot * 1.7) * 0.16;
        pos.set(a.x, a.y + POLE - 0.1, a.z);
        quat.setFromAxisAngle(yAxis, sway);
        base.compose(pos, quat, scl);
        const parts = PARTS[a.style];
        for (const half of ['a', 'b']) {
          const p = parts[half];
          off.makeTranslation(p.ox, p.oy, p.dz);
          size.makeScale(p.w * CLOTH_W, p.h * CLOTH_H, 1);
          mtx.copy(base).multiply(off).multiply(size);
          (half === 'a' ? clothA : clothB).setMatrixAt(k, mtx);
        }
      });
      clothA.instanceMatrix.needsUpdate = true;
      clothB.instanceMatrix.needsUpdate = true;
    }

    return {
      frame(f) {
        const state = f.state;
        const sig = state.districts.map((d) => d.slot + ':' + d.pal + ':' + d.style + ':' + d.name.length).join(',');
        let tilesChanged = false;
        for (let i = 0; i < AREA; i++) if (grid.district[i] !== lastTiles[i]) { tilesChanged = true; break; }
        if (tilesChanged || sig !== lastSig) {
          lastTiles.set(grid.district);
          lastSig = sig;
          writeWash(state);
          layoutFlags(state);
          wash.visible = grid.district.some((s) => s !== 0);
        }
        if (anchors.length) flutter(f.t);
      },
      setNight(on) { washMat.uniforms.uNight.value = on ? 1 : 0; },
      // Screen positions of each flag's top, in normalised device coordinates (-1 to 1), for the UI's labels.
      labels(camera) {
        return anchors.map((a) => {
          proj.set(a.x, a.y + POLE + 0.3, a.z).project(camera.cam);
          // a little past the edge still counts, so a label does not pop at the border
          return { slot: a.slot, nx: proj.x, ny: proj.y, visible: proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1 };
        });
      },
    };
  },
};
