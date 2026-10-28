// The tile map layer: grid overlay, zone paint, and the drag preview. One plane, one shader, a 64x64 data texture.
// Everything is drawn per pixel from the data, so lines stay crisp at any zoom and an update is 16 KB.
//
// API for UI modules (scene.sys('tileview')):
//   showGrid(on)                      dashed outline on open ground (roads and zoning both use it)
//   preview({ a, b, mode, zone })     mode 'paint' | 'erase'; returns { n, blocked } = tiles that would change / be refused
//   hover(tile | null, zone)          one-tile brush under the cursor
//   clearPreview(), flash()           flash() glows the last preview as it commits
import * as THREE from '../../../vendor/three/three.module.min.js';
import { GRID_N, GRID_HALF, TILE, rectTiles, tileIndex, inBounds } from '../../world/grid.js';
import { ZONE_DEFS } from '../../sim/zones.js';
import { groundPlaneGeometry, refreshGroundPlane } from '../ground.js';
import { createLandWatch } from '../land-watch.js';

const AREA = GRID_N * GRID_N;
const col = (hex) => new THREE.Color(hex);

const VERT = `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = `
precision highp float;
uniform sampler2D uTiles;
uniform vec3 uZ1, uZ2, uZ3, uZ4;
uniform float uGrid, uLots, uTime, uFlash, uNight;
varying vec3 vW;
const float N = ${GRID_N}.0;
vec4 tile(vec2 id){
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) return vec4(0.0);
  return texture2D(uTiles, (id + 0.5) / N);
}
float byteOf(float v){ return floor(v * 255.0 + 0.5); }
float bit(float v, float b){ return mod(floor(v / b), 2.0); }
vec3 zoneColor(float z){ return z < 1.5 ? uZ1 : z < 2.5 ? uZ2 : z < 3.5 ? uZ3 : uZ4; }
vec4 over(vec4 base, vec4 s){
  float a = s.a + base.a * (1.0 - s.a);
  vec3 c = a > 0.0001 ? (s.rgb * s.a + base.rgb * base.a * (1.0 - s.a)) / a : vec3(0.0);
  return vec4(c, a);
}
void main(){
  vec2 t = (vW.xz + ${(GRID_HALF * TILE + TILE / 2).toFixed(1)}) / ${TILE.toFixed(1)};
  vec2 id = floor(t), f = fract(t);
  if (id.x < 0.0 || id.y < 0.0 || id.x >= N || id.y >= N) discard;
  vec4 d = tile(id);
  float zone = byteOf(d.r), fl = byteOf(d.g), pv = byteOf(d.b), pz = byteOf(d.a);
  float open = bit(fl, 1.0), access = bit(fl, 2.0), lot = bit(fl, 4.0);
  vec2 e = min(f, 1.0 - f);
  float edge = min(e.x, e.y);
  float aa = fwidth(edge) * 1.1 + 0.002;
  float along = e.x < e.y ? f.y : f.x;
  vec3 ink = vec3(0.169, 0.149, 0.125);
  vec4 c = vec4(0.0);

  // outline distances to neighbours that differ (zone paint, then preview)
  float zo = 0.0, po = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 dir = k == 0 ? vec2(-1.0, 0.0) : k == 1 ? vec2(1.0, 0.0) : k == 2 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
    float dist = k == 0 ? f.x : k == 1 ? 1.0 - f.x : k == 2 ? f.y : 1.0 - f.y;
    vec4 n = tile(id + dir);
    if (byteOf(n.r) != zone) zo = max(zo, 1.0 - smoothstep(0.04 - aa, 0.04 + aa, dist));
    if (byteOf(n.b) != pv) po = max(po, 1.0 - smoothstep(0.05 - aa, 0.05 + aa, dist));
  }

  if (zone > 0.5) {
    float a = lot > 0.5 ? 0.5 * uLots : 0.82;
    vec3 fill = zoneColor(zone);
    if (access < 0.5 && lot < 0.5) {
      float s = step(0.5, fract((t.x + t.y) * 2.5));
      fill = mix(fill, fill * 0.82, s); a *= 0.78;
    }
    c = over(c, vec4(fill, a));
    float stitch = (1.0 - smoothstep(0.012, 0.012 + aa, abs(edge - 0.11))) * step(0.5, fract(along * 5.0));
    c = over(c, vec4(ink, stitch * 0.35 * (lot > 0.5 ? uLots : 1.0)));
    c = over(c, vec4(ink, zo * 0.85 * (lot > 0.5 ? max(uLots, 0.35) : 1.0)));
  }
  if (uGrid > 0.5 && open > 0.5 && zone < 0.5) {
    float line = (1.0 - smoothstep(0.028, 0.028 + aa, edge)) * step(0.5, fract(along * 4.0));
    c = over(c, vec4(1.0, 0.97, 0.9, 0.07));
    c = over(c, vec4(1.0, 0.97, 0.9, line * 0.8));
  }
  if (pv > 0.5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
    if (pv < 1.5) {                       // paint, valid
      c = over(c, vec4(mix(zoneColor(pz), vec3(1.0), 0.18), 0.55 + 0.1 * pulse));
      c = over(c, vec4(ink, po * 0.9));
    } else if (pv < 2.5) {                // paint, refused
      float s = step(0.5, fract((t.x - t.y) * 3.0));
      c = over(c, vec4(vec3(0.72, 0.28, 0.18), 0.22 + 0.2 * s));
    } else if (pv < 3.5) {                // erase target
      float s = step(0.5, fract((t.x + t.y) * 3.0));
      c = over(c, vec4(vec3(1.0, 0.96, 0.9), 0.35 + 0.3 * s));
      c = over(c, vec4(vec3(0.72, 0.28, 0.18), po * 0.9));
    } else if (pv < 4.5) {                // one-tile brush
      c = over(c, vec4(pz > 0.5 ? mix(zoneColor(pz), vec3(1.0), 0.25) : vec3(1.0, 0.96, 0.9), 0.35 + 0.2 * pulse));
      c = over(c, vec4(ink, po * 0.8));
    } else {                              // just committed: a glow that fades
      c = over(c, vec4(1.0, 0.97, 0.88, uFlash * 0.8));
    }
  }
  c.rgb *= 1.0 - 0.3 * uNight;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

export default {
  id: 'tileview',
  create({ world, grid }) {
    const data = new Uint8Array(AREA * 4);
    const tex = new THREE.DataTexture(data, GRID_N, GRID_N, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const z = (i) => col(ZONE_DEFS[i].paint);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTiles: { value: tex }, uZ1: { value: z(1) }, uZ2: { value: z(2) }, uZ3: { value: z(3) }, uZ4: { value: z(4) }, uGrid: { value: 0 }, uLots: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uNight: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      extensions: { derivatives: true },
    });
    const mesh = new THREE.Mesh(groundPlaneGeometry(0.17), mat);
    const land = createLandWatch();
    mesh.renderOrder = 2; mesh.frustumCulled = false;
    world.add(mesh);

    const prevKind = new Uint8Array(AREA), prevZone = new Uint8Array(AREA);
    let prevTiles = [], flashTiles = [], gridOn = false, sig = '', showLots = false, flash = 0;
    const roadSum = () => { let h = 0; for (let i = 0; i < AREA; i++) h = (h * 31 + grid.road[i]) | 0; return h; };

    function writeBase() {
      for (let i = 0; i < AREA; i++) {
        const gx = i % GRID_N, gz = (i / GRID_N) | 0, zone = grid.zone[i];
        const open = grid.isOpen(gx, gz);
        const access = (zone || open) && grid.roadBeside(gx, gz);
        data[i * 4] = zone;
        data[i * 4 + 1] = (open || zone ? 1 : 0) | (access ? 2 : 0) | (grid.lot[i] ? 4 : 0);
      }
      tex.needsUpdate = true;
    }
    function writePreview() {
      for (let i = 0; i < AREA; i++) { data[i * 4 + 2] = prevKind[i]; data[i * 4 + 3] = prevZone[i]; }
      tex.needsUpdate = true;
    }
    function setPreview(tiles, kind, zone) {
      for (const i of prevTiles) { prevKind[i] = 0; prevZone[i] = 0; }
      prevTiles = tiles.map((t) => t[0]);
      for (const [i, k] of tiles) { prevKind[i] = k || kind; prevZone[i] = zone; }
      writePreview();
    }

    return {
      showGrid(on) { gridOn = !!on; mat.uniforms.uGrid.value = gridOn ? 1 : 0; },
      // Rectangle brush. Returns how many tiles would change and how many are refused.
      preview({ a, b, mode, zone }) {
        const tiles = []; let n = 0, blocked = 0;
        for (const [gx, gz] of rectTiles(a, b)) {
          const i = tileIndex(gx, gz);
          if (mode === 'erase') { if (grid.zone[i]) { tiles.push([i, 3]); n++; } continue; }
          if (!grid.isOpen(gx, gz)) { tiles.push([i, 2]); blocked++; } else if (grid.zone[i] !== zone) { tiles.push([i, 1]); n++; } else tiles.push([i, 1]);
        }
        setPreview(tiles, 1, zone);
        return { n, blocked, total: tiles.length };
      },
      hover(tile, zone) {
        if (!tile || !inBounds(tile[0], tile[1])) { setPreview([], 4, 0); return; }
        const i = tileIndex(tile[0], tile[1]);
        setPreview([[i, grid.isOpen(tile[0], tile[1]) || grid.zone[i] ? 4 : 2]], 4, zone);
      },
      clearPreview() { setPreview([], 0, 0); },
      // Turn the preview into a glow that fades over about half a second.
      flash() {
        for (const i of prevTiles) { prevKind[i] = 5; prevZone[i] = 0; }
        flashTiles = prevTiles; prevTiles = [];
        flash = 1; writePreview();
      },
      frame(f) {
        const zoning = f.tool === 'zones' || f.view === 'demand';
        if (land.poll()) refreshGroundPlane(mesh.geometry, 0.17); // the terrain tools moved the ground
        if (zoning !== showLots) { showLots = zoning; mat.uniforms.uLots.value = zoning ? 1 : 0; }
        const next = f.state.zoneRev + '|' + roadSum();
        if (next !== sig) { sig = next; writeBase(); writePreview(); }
        mat.uniforms.uTime.value = f.t;
        if (flash > 0) {
          flash = Math.max(0, flash - f.dt * 2.2); mat.uniforms.uFlash.value = flash;
          if (flash === 0) { for (const i of flashTiles) if (prevKind[i] === 5) prevKind[i] = 0; flashTiles = []; writePreview(); }
        }
      },
      setNight(on) { mat.uniforms.uNight.value = on ? 1 : 0; },
    };
  },
};
