// A building is described by data (world/models.js). Here it becomes parts: geometry + color + local matrix.
// The town merges parts into a few meshes; the same parts feed the selection outline and the upgrade pop.
// Models and their level details live in src/render/models; docs/BUILDINGS.md is the design language.
import { buildParts } from './models/builders.js';
import { toonVC } from './models/materials.js';
import { xf } from './geom.js';

// part = { geo, mat, color, local, edge, body? }. `body` parts carry a multi-material box (walls + roof color).
export function makeParts(desc) { return buildParts(desc); }

export function worldMatrix(b, scale = 1) {
  return xf(b.x, b.y ?? 0.1, b.z, 0, b.rotY, 0, scale, scale, scale);
}

// Adds a building's parts to a Batch. `night` swaps the walls for the lit-window material.
export function addToBatch(batch, parts, world, night) {
  const vc = toonVC(), tmp = world.clone();
  for (const p of parts) {
    tmp.multiplyMatrices(world, p.local);
    if (p.body) {
      for (const s of p.splits) {
        const walls = s.materialIndex === 0 || s.materialIndex === 1 || s.materialIndex === 4 || s.materialIndex === 5;
        if (walls) batch.add(s.geo, night ? p.facadeMat.userData.night : p.facadeMat, tmp);
        else batch.add(s.geo, vc, tmp, { color: p.color });
      }
    } else batch.add(p.geo, vc, tmp, { color: p.color });
    if (p.edge) batch.addEdges(p.geo, tmp);
  }
}
