import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/sim.js';
import { getLayout } from '../src/world/layout.js';
import { checkLot } from '../src/world/placement.js';
import { createPanels } from '../src/ui/panels.js';

// The inspect card, driven without a browser: a tiny stand-in for document.getElementById is enough,
// because the card only sets innerHTML, hidden and a few button fields.
function fakeDom() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, hidden: true, innerHTML: '', disabled: false, onclick: null, querySelectorAll: () => [] });
    return els.get(id);
  };
  globalThis.document = { getElementById: el };
  return el;
}

const layout = getLayout();

function freeSpot(sim, fw, fd) {
  for (let z = 4; z < 60; z++) for (let x = 4; x + fw < 60; x++) if (checkLot(sim.grid, x, z, fw, fd).ok) return [x, z];
  throw new Error('no free spot');
}

function setup() {
  const el = fakeDom();
  const sim = createSim({ layout });
  sim.state.coins = 1e12;
  const closes = [];
  const panels = createPanels({ sim, send: (c) => sim.dispatch(c), toast() {}, onClose: () => closes.push(1), setTool() {} });
  return { el, sim, panels, closes };
}

test('picking a placed building opens the card with its name and a live upgrade button', () => {
  const { el, sim, panels } = setup();
  const [gx, gz] = freeSpot(sim, 1, 1);
  sim.dispatch({ type: 'place', model: 'cottage', gx, gz, fw: 1, fd: 1, rot: 0 });
  const id = sim.state.placed[0].id;
  panels.showInspect(id);
  assert.equal(el('inspect').hidden, false, 'card is open');
  assert.match(el('inspect').innerHTML, /Cottage/);
  assert.equal(el('up').disabled, false, 'upgrade is enabled with coins');
  el('up').onclick();
  assert.equal(sim.level(id), 2, 'the card upgrade button raises the level');
});

test('refreshing the card every frame does not throw for a placed building', () => {
  const { el, sim, panels } = setup();
  const [gx, gz] = freeSpot(sim, 1, 1);
  sim.dispatch({ type: 'place', model: 'tower', gx, gz, fw: 1, fd: 1, rot: 0 });
  panels.showInspect(sim.state.placed[0].id);
  for (let i = 0; i < 5; i++) assert.doesNotThrow(() => panels.refreshInspect());
  sim.state.coins = 0;
  panels.refreshInspect();
  assert.equal(el('up').disabled, true, 'a broke player sees the button disabled');
});

test('picking something that is not a building closes the card instead of throwing', () => {
  const { el, panels } = setup();
  assert.doesNotThrow(() => panels.showInspect('car-12'));
  assert.equal(el('inspect').hidden, true);
  assert.equal(panels.ui.selected, null);
  assert.doesNotThrow(() => panels.refreshInspect());
});

test('a building demolished while its card is open closes the card on the next frame', () => {
  const { el, sim, panels, closes } = setup();
  const [gx, gz] = freeSpot(sim, 1, 1);
  sim.dispatch({ type: 'place', model: 'cafe', gx, gz, fw: 1, fd: 1, rot: 0 });
  const id = sim.state.placed[0].id;
  panels.showInspect(id);
  sim.dispatch({ type: 'bulldoze', id });
  assert.doesNotThrow(() => panels.refreshInspect());
  assert.equal(closes.length, 1, 'asks the page to close the card');
});

test('a starter town building opens and refreshes too', () => {
  const { el, sim, panels } = setup();
  const b = layout.buildings.find((x) => x.floors > 0);
  panels.showInspect(b.id);
  assert.equal(el('inspect').hidden, false);
  assert.doesNotThrow(() => panels.refreshInspect());
  assert.equal(el('up').disabled, false);
});
