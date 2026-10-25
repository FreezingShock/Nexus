import test from 'node:test';
import assert from 'node:assert/strict';
import { rayGround, ISO } from '../src/render/camera-math.js';
import { heightAt, setTerrainSeed } from '../src/world/terrain.js';
import { worldToTile, GRID_HALF, TILE } from '../src/world/grid.js';

// A view ray in the orbit camera's direction that passes through point p, starting well back along the ray.
function rayThrough(p, elev = ISO.elev, az = ISO.az) {
  const d = { x: -Math.sin(az) * Math.cos(elev), y: -Math.sin(elev), z: -Math.cos(az) * Math.cos(elev) };
  const back = 500;
  return { o: { x: p.x - d.x * back, y: p.y - d.y * back, z: p.z - d.z * back }, d };
}

test('on flat ground the pick is where the ray crosses y = 0', () => {
  const { o, d } = rayThrough({ x: 7, y: 0, z: -11 });
  const g = rayGround(o, d, () => 0);
  assert.ok(Math.abs(g.x - 7) < 1e-3 && Math.abs(g.z + 11) < 1e-3);
});

test('a ray looking up never meets the ground', () => {
  assert.equal(rayGround({ x: 0, y: 5, z: 0 }, { x: 0, y: 0.2, z: -1 }, () => 0), null);
});

test('on a plateau the pick lands on top of it, not on the tile behind', () => {
  const h = (x, z) => (Math.abs(x) < 30 && Math.abs(z) < 30 ? 8 : 0);
  const { o, d } = rayThrough({ x: 3, y: 8, z: 3 });
  const g = rayGround(o, d, h);
  assert.ok(Math.abs(g.x - 3) < 0.01 && Math.abs(g.z - 3) < 0.01, `hit ${g.x}, ${g.z}`);
});

test('a hill in front hides the ground behind it', () => {
  const h = (x, z) => Math.max(0, 30 - 2 * Math.hypot(x - 10, z - 10)); // a cone between the camera and the origin
  const { o, d } = rayThrough({ x: 0, y: 0, z: 0 });
  const g = rayGround(o, d, h);
  assert.ok(g.y > 0.5, 'the ray stops on the hill');
});

test('on seeded hills the pick is the first ground along the ray, and the tile under the pointer', () => {
  setTerrainSeed(1234567);
  try {
    let checked = 0, same = 0;
    for (let gx = 6; gx < 90; gx += 7) for (let gz = 6; gz < 90; gz += 7) {
      const x = (gx - GRID_HALF) * TILE, z = (gz - GRID_HALF) * TILE, y = Math.max(0, heightAt(x, z));
      if (y < 1.5 || y > 26) continue; // only real hills inside the buildable range
      for (const az of [ISO.az, ISO.az + 2, ISO.az - 2.5]) for (const elev of [ISO.elevMin, ISO.elev, ISO.elevMax]) {
        const { o, d } = rayThrough({ x, y, z }, elev, az);
        const g = rayGround(o, d, heightAt);
        assert.ok(Math.abs(g.y - Math.max(0, heightAt(g.x, g.z))) < 0.02, 'the hit is on the ground');
        // Nothing along the ray before the hit is under the ground (fine samples).
        const tHit = (g.y - o.y) / d.y;
        for (let t = tHit - 60; t < tHit - 0.05; t += 0.05) {
          const px = o.x + d.x * t, pz = o.z + d.z * t;
          assert.ok(o.y + d.y * t > Math.max(0, heightAt(px, pz)) - 0.05, `no ground skipped at ${gx},${gz}`);
        }
        checked++;
        if (worldToTile(g.x, g.z).join() === `${gx},${gz}`) same++;
      }
    }
    assert.ok(checked > 40, `enough hill tiles were checked (${checked})`);
    // The old y = 0 cut missed nearly every one of these; now only views where a taller hill stands in front differ.
    assert.ok(same / checked > 0.6, `the pointer's tile is picked (${same} of ${checked})`);
  } finally { setTerrainSeed(0); }
});

test('the old y = 0 cut lands on the wrong tile on a hill (why this exists)', () => {
  const h = () => 9;
  const { o, d } = rayThrough({ x: 0, y: 9, z: 0 });
  const k = -o.y / d.y, flat = worldToTile(o.x + d.x * k, o.z + d.z * k), g = rayGround(o, d, h);
  assert.notDeepEqual(flat, worldToTile(0, 0));
  assert.deepEqual(worldToTile(g.x, g.z), worldToTile(0, 0));
});
