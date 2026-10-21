import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/core/registry.js';
import { systems } from '../src/sim/systems/index.js';
import { renderSystems } from '../src/render/systems/index.js';
import { uiModules } from '../src/ui/modules/index.js';

test('registry rejects missing and duplicate ids', () => {
  const r = createRegistry('t');
  r.add({ id: 'a' });
  assert.throws(() => r.add({ id: 'a' }), /duplicate/);
  assert.throws(() => r.add({}), /string id/);
});

test('registry.run calls hooks in order and skips absent ones', () => {
  const r = createRegistry('t'), seen = [];
  r.add({ id: 'a', tick: (x) => seen.push('a' + x) });
  r.add({ id: 'b' });
  r.add({ id: 'c', tick: (x) => seen.push('c' + x) });
  r.run('tick', 1);
  assert.deepEqual(seen, ['a1', 'c1']);
});

test('every registered system has a unique id, and sim command names do not collide', () => {
  for (const list of [systems, renderSystems, uiModules]) assert.equal(new Set(list.map((d) => d.id)).size, list.length);
  const names = systems.flatMap((d) => Object.keys(d.commands || {}));
  assert.equal(new Set(names).size, names.length);
});
