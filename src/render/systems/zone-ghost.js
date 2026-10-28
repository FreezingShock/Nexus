// A see-through hint of what a zone could grow into: while the Zones tool hovers or drags, each tile where a building
// could grow (open ground with a road beside it) shows a ghost of a random model from that zone's families. Purely
// visual: the models are picked from a hash of the tile, not from the sim, so the lot that really grows may differ.
// Driven by the zoning UI module: scene.sys('zone-ghost').show(tiles, zone) / .hide().
import { lotDescription } from '../../world/lots.js';
import { tileIndex } from '../../world/grid.js';
import { makeParts, addToBatch, worldMatrix } from '../buildings.js';
import { Batch } from '../geom.js';

const MAX_GHOSTS = 64; // a big drag still ghosts only this many, nearest the start of the rectangle
const OPACITY = 0.5;

// A stable pseudo-random seed per tile and zone, so a ghost does not re-roll while the rectangle grows.
const seedOf = (tile, zone) => Math.imul(tile + 1, 2654435761) ^ Math.imul(zone + 7, 40503) >>> 0;

export default {
  id: 'zone-ghost',
  create({ THREE, world, grid }) {
    const root = new THREE.Group(); root.visible = false; world.add(root);
    let made = [], key = '';
    const roadAt = (gx, gz) => grid.roadAt(gx, gz) !== 0;

    function clear() {
      for (const m of made) { root.remove(m); m.geometry.dispose(); if (m.userData.own) m.material.dispose(); }
      made = []; key = '';
    }
    return {
      // tiles: [[gx, gz], ...] from the brush; only tiles that could really grow a building get a ghost.
      show(tiles, zone) {
        const picked = [];
        for (const [gx, gz] of tiles) {
          if (picked.length >= MAX_GHOSTS) break;
          if (grid.isOpen(gx, gz) && grid.roadBeside(gx, gz)) picked.push(tileIndex(gx, gz));
        }
        const k = zone + ':' + picked.join(',');
        if (k === key) { root.visible = picked.length > 0; return; }
        clear(); key = k;
        if (!picked.length) { root.visible = false; return; }
        const batch = new Batch();
        for (const i of picked) {
          const seed = seedOf(i, zone) >>> 0;
          const d = lotDescription(zone, 1, seed, i, roadAt, null);
          if (!d) continue;
          addToBatch(batch, makeParts(d), worldMatrix(d), false);
        }
        made = batch.build(root);
        for (const m of made) {
          m.castShadow = m.receiveShadow = false; m.raycast = () => {};
          m.material = m.material.clone(); m.userData.own = true;
          m.material.transparent = true; m.material.opacity = m.isLineSegments ? OPACITY * 0.8 : OPACITY; m.material.depthWrite = false;
        }
        root.visible = true;
      },
      hide() { root.visible = false; },
      setNight() {},
    };
  },
};
