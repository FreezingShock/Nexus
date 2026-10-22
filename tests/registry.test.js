// Every feature registry must hold definitions with a string id, and no two may share one.
// A missing id made createUi throw on startup (black screen), so this runs without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiModules } from '../src/ui/modules/index.js';
import { renderSystems } from '../src/render/systems/index.js';
import { systems } from '../src/sim/systems/index.js';

for (const [name, list] of [['ui modules', uiModules], ['render systems', renderSystems], ['sim systems', systems]]) {
  test(`every ${name} definition has a unique string id`, () => {
    const ids = list.map((d) => d && d.id);
    for (const id of ids) assert.equal(typeof id, 'string', `${name}: a definition has no string id`);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate id`);
  });
}
