// Runs every UI module's create() in node, against a real sim and a stub DOM, and reads back what the HUD wrote.
// This catches startup crashes such as a const read before it is declared, which the markup and text tests miss.
// Layout and pictures are not checked here: nate checks those on localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { uiModules } from '../src/ui/modules/index.js';
import { createHud } from '../src/ui/hud.js';
import { fmtCompact } from '../src/ui/format.js';

// A value that accepts any property, call or assignment, so module code runs without a browser.
function deep() {
  const target = function () {};
  const p = new Proxy(target, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (k in t) return t[k];
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}
// An element that remembers what was assigned to it, so the test can read the text back.
function node() {
  const store = {};
  const base = deep();
  return new Proxy(base, {
    get(t, k) { return k in store ? store[k] : base[k]; },
    set(t, k, v) { store[k] = v; return true; },
  });
}

const els = {};
const elFor = (id) => (els[id] ||= node());
globalThis.document = {
  getElementById: elFor,
  createElement: () => node(),
  querySelector: () => node(),
  querySelectorAll: () => [],
  body: node(),
  documentElement: node(),
  addEventListener() {},
};
globalThis.addEventListener = () => {};
// Browser observers the modules create. They never fire here: the tests read start-up state only.
class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
globalThis.MutationObserver = Observer;
globalThis.ResizeObserver = Observer;
globalThis.IntersectionObserver = Observer;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;

test('every UI module starts up in node without throwing', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const send = (cmd) => sim.dispatch(cmd);
  const scene = deep();
  for (const d of uiModules) {
    assert.doesNotThrow(() => d.create({ sim, send, scene, toast() {}, tool: () => null, quality: deep(), sound: deep() }), d.id);
  }
});

test('the HUD fills its currency plaques and hover cards on the first frame', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const hud = createHud({ sim, send: (cmd) => sim.dispatch(cmd), onSettings() {}, calendar: null });
  hud.frame(1, 0, true);
  assert.equal(elFor('coins').textContent, fmtCompact(sim.state.coins));
  assert.equal(elFor('parts').textContent, fmtCompact(sim.state.parts));
  assert.match(elFor('coinspop').innerHTML, /in hand/);
  assert.match(elFor('renpop').innerHTML, /Renewal/);
});
