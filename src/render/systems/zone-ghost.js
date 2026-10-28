// A see-through hint of what a zone could grow into: while the Zones tool hovers or drags, each tile where a building
// could grow (open ground with a road beside it) shows a ghost of one of the zone's real models.
// Cheap by design: each zone has a small pool of VARIANTS ghost buildings, built once into merged geometry (the same
// parts the real lots use) and drawn as instanced meshes, one per material. Moving the brush only rewrites instance
// matrices, and only when the brush lands on a different set of tiles; no building is ever rebuilt while dragging.
// The variant per tile comes from a hash of the tile, so ghosts do not re-roll as a drag grows; it is only a hint,
// and the lot that really grows may differ. Driven by the zoning UI module: show(tiles, zone, sig) / hide().
import { lotDescription, ZONE_MODELS } from '../../world/lots.js';
import { tileCenter, tileIndex } from '../../world/grid.js';
import { standOn } from '../../world/models.js';
import { makeParts, addToBatch } from '../buildings.js';
import { Batch } from '../geom.js';

const VARIANTS = 6;  // ghost buildings per zone
const CAP = 512;     // instances per variant; a bigger drag ghosts the first tiles it reaches
const OPACITY = 0.55;
const hash = (n) => Math.imul(Math.imul(n + 1, 2654435761) ^ (n >>> 7), 2246822519) >>> 0;
const noRoad = () => false;

export default {
  id: 'zone-ghost',
  create({ THREE, world, grid }) {
    const root = new THREE.Group(); root.visible = false; world.add(root);
    const pools = new Map(); // zone -> [{ meshes: InstancedMesh[], rec }]
    let key = '', shown = null;
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

    // The pool for a zone: VARIANTS buildings (seeds chosen so every model of the zone appears), merged and made instanced.
    function poolFor(zone) {
      let pool = pools.get(zone);
      if (pool) return pool;
      pool = [];
      const nModels = ZONE_MODELS[zone] ? ZONE_MODELS[zone].length : 1;
      for (let i = 0; i < VARIANTS; i++) {
        const h = hash(i * 7 + zone), seed = (h - (h % nModels) + (i % nModels)) >>> 0;
        const d = lotDescription(zone, 1, seed, 0, noRoad);
        if (!d) continue;
        const batch = new Batch(), group = new THREE.Group();
        addToBatch(batch, makeParts(d), new THREE.Matrix4(), false); // local space: instances place and turn it
        const meshes = [];
        for (const m of batch.build(group)) {
          if (!m.isMesh) { m.geometry.dispose(); continue; } // the ink lines are not instanced; ghosts go without
          const mt = m.material.clone();
          mt.transparent = true; mt.opacity = OPACITY; mt.depthWrite = false;
          const im = new THREE.InstancedMesh(m.geometry, mt, CAP);
          im.count = 0; im.visible = false; im.frustumCulled = false; im.castShadow = im.receiveShadow = false; im.raycast = () => {};
          root.add(im); meshes.push(im);
        }
        pool.push({ meshes });
      }
      pools.set(zone, pool);
      return pool;
    }

    const turnOf = (gx, gz) => { for (const [dx, dz, r] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]]) if (grid.roadAt(gx + dx, gz + dz) !== 0) return r; return 0; };
    function setAll(on) { for (const p of pools.values()) for (const v of p) for (const m of v.meshes) { m.count = 0; m.visible = false; } root.visible = on; }

    return {
      // tiles: [[gx, gz], ...]. `sig` names the brush (a rectangle or a tile) so an unchanged brush costs nothing.
      show(tiles, zone, sig) {
        const k = zone + '|' + sig;
        if (sig !== undefined && k === key) return;
        key = k;
        setAll(false);
        const pool = poolFor(zone);
        if (!pool.length) return;
        const counts = new Array(pool.length).fill(0);
        let any = false;
        for (const [gx, gz] of tiles) {
          if (!grid.isOpen(gx, gz) || !grid.roadBeside(gx, gz)) continue;
          const v = hash(tileIndex(gx, gz) * 5 + zone) % pool.length;
          if (counts[v] >= CAP) continue;
          const [cx, cz] = tileCenter(gx, gz), { y } = standOn(cx, cz, 1, 1);
          q.setFromAxisAngle(up, turnOf(gx, gz) * Math.PI / 2); pos.set(cx, y, cz);
          mat.compose(pos, q, one);
          for (const m of pool[v].meshes) m.setMatrixAt(counts[v], mat);
          counts[v]++; any = true;
        }
        pool.forEach((v, i) => { for (const m of v.meshes) { m.count = counts[i]; m.visible = counts[i] > 0; m.instanceMatrix.needsUpdate = true; } });
        root.visible = any;
      },
      hide() { root.visible = false; key = ''; },
      setNight() {},
    };
  },
};
