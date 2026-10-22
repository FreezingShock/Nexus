// Farmland: fields with crop rows and hedges, the crop data, and the farm's draw calls. The render side is run in node
// with a stub canvas, so only the shape of the meshes is checked here; the look is checked on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getLayout } from '../src/world/layout.js';
import { CROPS } from '../src/world/palettes.js';
import { BASE, createGrid } from '../src/world/grid.js';
import { starterReserved } from '../src/world/starter.js';
import { tileIndex, worldToTile } from '../src/world/grid.js';

const layout = getLayout();

test('every field has a known crop and sits on farmland', () => {
  const g = createGrid(layout);
  assert.equal(layout.farms.length, 24);
  for (const f of layout.farms) {
    assert.ok(Number.isInteger(f.crop) && f.crop >= 0 && f.crop < CROPS.length, 'crop of a field');
    const [gx, gz] = worldToTile(f.x, f.z);
    assert.equal(g.baseAt(gx, gz), BASE.FARM, `field at ${f.x},${f.z} is farmland`);
  }
});

test('fields keep clear of the starter village', () => {
  const reserved = starterReserved();
  const g = createGrid(layout);
  for (const f of layout.farms) {
    const hx = (f.turned ? f.d : f.w) / 2 + 1, hz = (f.turned ? f.w : f.d) / 2 + 1;
    for (let z = f.z - hz; z <= f.z + hz; z += 3) for (let x = f.x - hx; x <= f.x + hx; x += 3) {
      const [gx, gz] = worldToTile(x, z);
      assert.ok(!reserved.has(tileIndex(gx, gz)), 'a field tile is in the village');
      assert.notEqual(g.baseAt(gx, gz), BASE.WATER, 'a field tile is in the river');
    }
  }
});

test('each crop has two colours, a ground and a row', () => {
  for (const c of CROPS) {
    assert.match(c.base, /^#[0-9A-F]{6}$/i);
    assert.match(c.row, /^#[0-9A-F]{6}$/i);
    assert.notEqual(c.base, c.row);
  }
});

// A stub canvas: enough for the textures the farm builds, so the meshes can be counted.
function stubDocument() {
  if (globalThis.document) return;
  const ctx = { fillRect() {}, fillStyle: '' };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

test('the whole farm is a handful of draw calls: four crops, two hedge meshes and one ink line set', async () => {
  stubDocument();
  const THREE = await import('../vendor/three/three.module.min.js');
  const { buildFarms } = await import('../src/render/terrain.js');
  const parent = new THREE.Group();
  buildFarms(parent, layout.farms);
  assert.ok(parent.children.length <= 7, 'meshes: ' + parent.children.length);
  let triangles = 0;
  for (const m of parent.children) if (m.geometry && m.geometry.index) triangles += m.geometry.index.count / 3;
  assert.ok(triangles < 30000, 'triangles: ' + triangles);
});
