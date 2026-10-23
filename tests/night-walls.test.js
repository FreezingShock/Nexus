// Walls keep their daytime colour at night. The night and dim wall textures once painted every wall navy (#6C7191);
// canvas does not exist in node, so this guards the source: no fixed wall colour, and the cache keys carry the palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kit = readFileSync(new URL('../src/render/models/materials.js', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../src/render/materials.js', import.meta.url), 'utf8');

test('night wall textures use the palette wall colour, not a fixed navy', () => {
  assert.ok(!/6C7191/i.test(kit), 'kit wall textures must not hardcode the night navy');
  assert.ok(!/6C7191/i.test(legacy), 'legacy facade must not hardcode the night navy');
  assert.match(kit, /nightStyle\(style, P\.wall, accent\)/);
  assert.match(kit, /dimStyle\(style, P\.wall, accent\)/);
  assert.match(legacy, /nightFacade\(PAL\[pal\]\.wall\)/);
});
