// Costumes for the townsfolk during the festive seasons: witch hats, bedsheet ghosts and pumpkin heads at Halloween,
// Santa and elf hats and reindeer antlers at Christmas, tall striped hats on the Fourth of July. Every shape lives in one
// merged geometry with an `aPart` number per vertex; each person carries an instanced `aKind` and the shader shows only
// the part that matches (or none). So a crowd in costume is one more draw call per crowd, sharing the people's matrices.
// Shapes are in the person's frame: about 0.9 tall, facing +x, head centred at y 0.84.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { mergeParts, tintToon } from '../life/figures.js';
import { unit } from '../../sim/schedule.js';

export const PARTS = ['witch', 'santa', 'tophat', 'ghost', 'pumpkin', 'antlers'];
const P = Object.fromEntries(PARTS.map((k, i) => [k, i]));
const WHITE = 0xF7F1E3, SHEET = 0xF4EFE4, INK = 0x2B2620, ORANGE = 0xE07B39, STEM = 0x4F6B34, ANTLER = 0x8A6744;

// Who wears what, by event: [part, share of townsfolk, coat-and-hat colours to pick from]. Shares add up to under one:
// plenty of people just come as themselves.
export const WARDROBE = {
  halloween: [['witch', 0.2, [0x2E2A33, 0x5B3F7A, 0x2F4A3A]], ['ghost', 0.12, [SHEET]], ['pumpkin', 0.1, [ORANGE]]],
  christmas: [['santa', 0.28, [0xC2483A]], ['santa', 0.1, [0x3F8455]], ['antlers', 0.1, [ANTLER]]],
  july4: [['tophat', 0.16, [0x3F6FB0, 0xC2483A, WHITE]]],
};

const tag = (geo, part) => { geo.userData.part = part; return geo; };
const at = (g, x, y, z) => g.translate(x, y, z);

// One geometry for every costume. aTint 1 takes the person's costume colour; aPart says which costume a vertex is.
export function costumeGeometry() {
  const parts = [
    // witch: a wide brim and a tall crooked cone
    { geo: tag(at(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 10), 0, 0.93, 0), P.witch), color: 0xffffff, tint: true },
    { geo: tag(at(new THREE.ConeGeometry(0.13, 0.4, 7).rotateZ(0.18), -0.03, 1.13, 0), P.witch), color: 0xffffff, tint: true },
    { geo: tag(at(new THREE.CylinderGeometry(0.135, 0.14, 0.04, 8), 0, 0.96, 0), P.witch), color: 0xE6BC62, tint: false },
    // santa (or elf): a floppy cone with a white trim and bobble
    { geo: tag(at(new THREE.ConeGeometry(0.15, 0.32, 7).rotateZ(0.5), -0.06, 1.05, 0), P.santa), color: 0xffffff, tint: true },
    { geo: tag(at(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8), 0, 0.93, 0), P.santa), color: WHITE, tint: false },
    { geo: tag(at(new THREE.SphereGeometry(0.05, 6, 4), -0.17, 1.15, 0), P.santa), color: WHITE, tint: false },
    // tall hat with a white band and a brim
    { geo: tag(at(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 10), 0, 0.94, 0), P.tophat), color: 0xffffff, tint: true },
    { geo: tag(at(new THREE.CylinderGeometry(0.12, 0.11, 0.3, 9), 0, 1.1, 0), P.tophat), color: 0xffffff, tint: true },
    { geo: tag(at(new THREE.CylinderGeometry(0.122, 0.122, 0.06, 9), 0, 1.0, 0), P.tophat), color: WHITE, tint: false },
    // ghost: a sheet over everything, with two dark eyes
    { geo: tag(at(new THREE.CylinderGeometry(0.17, 0.27, 0.78, 9), 0, 0.42, 0), P.ghost), color: SHEET, tint: false },
    { geo: tag(at(new THREE.SphereGeometry(0.19, 8, 6), 0, 0.84, 0), P.ghost), color: SHEET, tint: false },
    { geo: tag(at(new THREE.BoxGeometry(0.02, 0.06, 0.04), 0.185, 0.88, -0.06), P.ghost), color: INK, tint: false },
    { geo: tag(at(new THREE.BoxGeometry(0.02, 0.06, 0.04), 0.185, 0.88, 0.06), P.ghost), color: INK, tint: false },
    // pumpkin head over the real one
    { geo: tag(at(new THREE.SphereGeometry(0.2, 8, 6).scale(1, 0.82, 1), 0, 0.86, 0), P.pumpkin), color: ORANGE, tint: false },
    { geo: tag(at(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5), 0, 1.04, 0), P.pumpkin), color: STEM, tint: false },
    { geo: tag(at(new THREE.BoxGeometry(0.02, 0.04, 0.04), 0.19, 0.9, -0.06), P.pumpkin), color: INK, tint: false },
    { geo: tag(at(new THREE.BoxGeometry(0.02, 0.04, 0.04), 0.19, 0.9, 0.06), P.pumpkin), color: INK, tint: false },
    { geo: tag(at(new THREE.BoxGeometry(0.02, 0.03, 0.12), 0.195, 0.8, 0), P.pumpkin), color: INK, tint: false },
    // reindeer antlers
    ...[-1, 1].flatMap((s) => [
      { geo: tag(at(new THREE.BoxGeometry(0.03, 0.2, 0.03).rotateX(s * 0.35), 0, 1.03, s * 0.09), P.antlers), color: ANTLER, tint: false },
      { geo: tag(at(new THREE.BoxGeometry(0.03, 0.1, 0.03).rotateX(s * 1.1), 0.02, 1.08, s * 0.16), P.antlers), color: ANTLER, tint: false },
    ]),
  ];
  const g = mergeParts(parts);
  const flat = parts.map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo));
  const part = new Float32Array(g.attributes.position.count);
  let o = 0;
  flat.forEach((f, k) => { const n = f.attributes.position.count; part.fill(parts[k].geo.userData.part, o, o + n); o += n; });
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return g;
}

// The tintToon material, showing only the part that matches each person's aKind (-1: none).
export function costumeMaterial() {
  const m = tintToon();
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed *= step(abs(aPart - aKind), 0.5);');
  };
  m.customProgramCacheKey = () => key.call(m) + ':costume';
  return m;
}

// What person `id` wears for `event`: { kind (index into PARTS), color } or null. Steady for a person and an event.
export function costumeFor(event, id) {
  const list = WARDROBE[event];
  if (!list) return null;
  let r = unit(id, 61);
  for (const [part, share, colors] of list) {
    if (r < share) return { kind: P[part], color: colors[Math.floor(unit(id, 62) * colors.length)] };
    r -= share;
  }
  return null;
}

// A costume mesh that rides on a crowd's instanced mesh: the same matrices (shared attribute), its own kinds and colours.
export function costumeLayer(world, crowd, max) {
  const geo = costumeGeometry();
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-1), 1);
  geo.setAttribute('aKind', kind);
  const mesh = new THREE.InstancedMesh(geo, costumeMaterial(), max);
  mesh.instanceMatrix = crowd.instanceMatrix;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0; mesh.visible = false;
  world.add(mesh);
  const c = new THREE.Color();
  let anyone = false;
  return {
    mesh,
    // dresses slot i as person `id` for `event` ('' undresses)
    dress(i, event, id) {
      const k = costumeFor(event, id);
      kind.array[i] = k ? k.kind : -1;
      if (k) mesh.instanceColor.setXYZ(i, ...c.setHex(k.color).toArray());
      anyone = !!event;
      kind.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    // after the crowd moved: follow its count and visibility
    sync() { mesh.count = crowd.count; mesh.visible = anyone && crowd.visible !== false && crowd.count > 0; },
    clear() { kind.array.fill(-1); kind.needsUpdate = true; anyone = false; mesh.visible = false; },
  };
}
