// The top HUD row: number formats, the town name and badge rules, the v4 save migration, the town commands,
// the hover-card text, and the markup the row depends on. Node only: no browser is run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fmtCompact, fmtExact, fmtRateCompact } from '../src/ui/format.js';
import { DEFAULT_TOWN, TOWN_COLORS, TOWN_ICONS, TOWN_NAME_MAX, cleanName, sanitizeTown } from '../src/sim/town.js';
import { SAVE_VERSION, migrations, sanitize, unwrap, wrap } from '../src/sim/save.js';
import { createSim } from '../src/sim/sim.js';
import { freshState } from '../src/sim/state.js';
import { getLayout } from '../src/world/layout.js';
import { coinsCard, demandCard, nextRoadUnlock, partsCard, renewalCard, sourceRows, townCard } from '../src/ui/hud-detail.js';
import { townIconSvg } from '../src/ui/town-icons.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---- number formats ----

test('compact numbers: exact under 10,000, then K, M and B, never longer than six characters', () => {
  assert.equal(fmtCompact(0), '0');
  assert.equal(fmtCompact(8059), '8,059');
  assert.equal(fmtCompact(9999), '9,999');
  assert.equal(fmtCompact(10000), '10.0K');
  assert.equal(fmtCompact(12400), '12.4K');
  assert.equal(fmtCompact(123456), '123K');
  assert.equal(fmtCompact(999999), '999K', 'rounds down, so it never reads 1000K');
  assert.equal(fmtCompact(1e6), '1.0M');
  assert.equal(fmtCompact(3200000), '3.2M');
  assert.equal(fmtCompact(1.2e9), '1.2B');
  assert.equal(fmtCompact(-5), '0', 'a negative balance never happens, and shows as zero');
  assert.equal(fmtCompact(NaN), '0');
  for (let n = 0; n < 3e9; n = n * 1.37 + 7) assert.ok(fmtCompact(n).length <= 6, fmtCompact(n));
});

test('the exact value is grouped and whole, for the hover cards', () => {
  assert.equal(fmtExact(8059.9), '8,059');
  assert.equal(fmtExact(12400000), '12,400,000');
  assert.equal(fmtExact(undefined), '0');
});

test('per-second rates: signed, one decimal under 10,000, a true minus for upkeep', () => {
  assert.equal(fmtRateCompact(12.4), '+12.4/s');
  assert.equal(fmtRateCompact(12), '+12/s');
  assert.equal(fmtRateCompact(0), '+0/s');
  assert.equal(fmtRateCompact(-0.4), '−0.4/s');
  assert.equal(fmtRateCompact(12400), '+12.4K/s');
});

// ---- town name and badge ----

test('a town name is trimmed, single-spaced, capped, and never blank', () => {
  assert.equal(cleanName('  Hollow   Field  '), 'Hollow Field');
  assert.equal(cleanName('a\u0000b\u0007c'), 'a b c');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(42), null);
  assert.equal(cleanName('x'.repeat(60)).length, TOWN_NAME_MAX);
  // the cap counts code points, so an emoji is never split in half
  const long = '🏡'.repeat(30);
  assert.equal([...cleanName(long)].length, TOWN_NAME_MAX);
});

test('a town badge keeps only a known icon and colour, and falls back to the default', () => {
  assert.deepEqual(sanitizeTown(null), DEFAULT_TOWN);
  assert.deepEqual(sanitizeTown({ name: 'Mill Lane', icon: 'windmill', color: 'sky' }), { name: 'Mill Lane', icon: 'windmill', color: 'sky' });
  assert.deepEqual(sanitizeTown({ name: '', icon: '<script>', color: 'neon' }), DEFAULT_TOWN);
  assert.ok(TOWN_ICONS.length >= 8, 'eight icons at least');
  assert.ok(Object.keys(TOWN_COLORS).length >= 6, 'six colours at least');
});

test('the icon set draws an SVG for every icon, and an unknown name draws the house', () => {
  for (const n of TOWN_ICONS) assert.match(townIconSvg(n), /^<svg width="26" height="26" viewBox="0 0 26 26"/);
  assert.equal(townIconSvg('nope'), townIconSvg('house'));
});

// ---- save: version 6 and the migration ----

test('the save is version 7, and a version 3 town gets the default name and badge', () => {
  assert.equal(SAVE_VERSION, 7);
  const old = { coins: 500, roads: {}, speed: 2, levels: {} };
  const migrated = migrations[2](old);
  assert.deepEqual(migrated.town, DEFAULT_TOWN);
  const back = unwrap(JSON.stringify({ v: 3, savedAt: 1, state: old }));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.town, DEFAULT_TOWN);
});

test('a saved name and badge survive a save round trip, and bad values are repaired on load', () => {
  const state = { ...freshState(), town: { name: 'Mill Lane', icon: 'boat', color: 'mint' } };
  const back = unwrap(JSON.stringify(wrap(state, 5)));
  assert.deepEqual(back.state.town, { name: 'Mill Lane', icon: 'boat', color: 'mint' });
  const broken = sanitize({ ...state, town: { name: 'x'.repeat(99), icon: 'dragon', color: 'gold' } });
  assert.equal(broken.town.name.length, TOWN_NAME_MAX);
  assert.equal(broken.town.icon, DEFAULT_TOWN.icon);
  assert.equal(broken.town.color, DEFAULT_TOWN.color);
});

// ---- town commands and income breakdown in the sim ----

test('renameTown and setTownBadge change the town through the sim, and ignore bad input', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.dispatch({ type: 'renameTown', name: '  Hollow   Field ' });
  assert.equal(sim.state.town.name, 'Hollow Field');
  sim.dispatch({ type: 'renameTown', name: '   ' });
  assert.equal(sim.state.town.name, 'Hollow Field', 'a blank name keeps the old one');
  sim.dispatch({ type: 'setTownBadge', icon: 'church', color: 'clay' });
  assert.deepEqual(sim.state.town, { name: 'Hollow Field', icon: 'church', color: 'clay' });
  sim.dispatch({ type: 'setTownBadge', icon: 'dragon' });
  assert.equal(sim.state.town.icon, 'church', 'an unknown icon keeps the current one');
  sim.dispatch({ type: 'setTownBadge', color: 'mint' });
  assert.equal(sim.state.town.color, 'mint');
});

test('a Renewal keeps the town name and badge', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  sim.dispatch({ type: 'renameTown', name: 'Hollow Field' });
  sim.dispatch({ type: 'setTownBadge', icon: 'windmill', color: 'sage' });
  sim.state.runEarned = 1e7; // enough coins this run for one Renewal point
  sim.dispatch({ type: 'renew' });
  assert.equal(sim.state.renewals, 1, 'the Renewal happened');
  assert.deepEqual(sim.state.town, { name: 'Hollow Field', icon: 'windmill', color: 'sage' });
});

test('the sim reports the income split by system, for the hover cards', () => {
  const sim = createSim({ state: freshState(), layout: getLayout() });
  const bd = sim.breakdown();
  assert.equal(typeof bd.coins.base, 'number');
  assert.equal(typeof bd.parts.base, 'number');
  assert.ok(Object.keys(bd.mult).length >= 1, 'systems with a multiplier are listed');
});

// ---- hover-card text ----

test('the hover cards show exact numbers, the next unlock and the Renewal progress', () => {
  const s = { ...freshState(), coins: 8059, parts: 502, runEarned: 0, points: 0, renewals: 0, earned: 9000 };
  const bd = { coins: { base: 12, placement: 8.2, services: -0.4 }, parts: { base: 0.4 }, mult: {} };
  const coins = coinsCard(s, 20.2, bd);
  assert.match(coins, /<b>8,059<\/b> in hand/);
  assert.match(coins, /Buildings/);
  assert.match(coins, /Next milestone/);
  assert.match(coins, /−/, 'upkeep reads as a minus');
  const parts = partsCard(s, 0.4, bd);
  assert.match(parts, /Bike street/, 'the cheapest locked road is the next unlock');
  assert.match(parts, /Ready: 450 Parts to open it/, 'with enough Parts, the card says so');
  assert.match(partsCard({ ...s, parts: 40 }, 0.4, bd), /40 of 450 Parts/, 'short of the cost, it shows the progress');
  const ren = renewalCard(s);
  assert.match(ren, /Opens at 10,000,000 coins/);
  assert.match(ren, /0%/);
  assert.match(renewalCard({ ...s, runEarned: 5e6 }), /50%/);
});

test('the next road unlock skips the ones already open, and reports none when all are open', () => {
  assert.equal(nextRoadUnlock({ roadUnlocks: [] }).name, 'Bike street');
  assert.equal(nextRoadUnlock({ roadUnlocks: ['bike', 'one'] }).name, 'Bus avenue');
  assert.equal(nextRoadUnlock({ roadUnlocks: ['bike', 'one', 'bus', 'free'] }), null);
});

test('the source rows are the biggest first, skip the tiny ones, and name unknown systems', () => {
  const rows = sourceRows({ base: 12, placement: 8.2, mystery: 0.01, services: -0.4 });
  assert.deepEqual(rows.map((r) => r.label), ['Base income', 'Buildings', 'Services and landmarks']);
  assert.equal(rows[2].value, '−0.4/s');
  assert.equal(sourceRows({ mystery: 3 })[0].label, 'Other');
});

test('the demand card gives full names, percentages and what drives each bar', () => {
  const stats = { byZone: [0, 3, 2, 1, 0] };
  const html = demandCard({ 1: 0.75, 2: 0.4, 3: 0.9 }, stats, [null, '#8FCB9B', '#EE9F8D', '#E2C07C']);
  for (const name of ['Residential', 'Commercial', 'Industrial']) assert.match(html, new RegExp(name));
  assert.match(html, /75%/);
  assert.match(html, /3 home lots against 1 workshop lots/);
  assert.match(html, /Strong: zone more of this/);
});

test('the town card never includes the town name, so saved text stays out of the markup', () => {
  const html = townCard({ ...freshState(), town: { name: '<img src=x>', icon: 'house', color: 'mustard' } });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Click the name to rename it/);
});

// ---- markup the row depends on ----

test('the top row has every plaque, its hover card and the badge picker, and the stylesheet is linked', () => {
  const html = read('index.html');
  for (const id of ['townplaque', 'townname', 'townedit', 'townbadge', 'townpop', 'townpick', 'coinschip', 'coinspop',
    'partschip', 'partspop', 'renchip', 'renpop', 'hpchip', 'hppop', 'hp-panel', 'hppct', 'hpbar', 'demandw', 'demandrows', 'demandpop', 'coins', 'parts', 'rate', 'prate', 'renewal', 'renewalbar']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /<link rel="stylesheet" href="css\/hud\.css">/);
  assert.match(read('css/hud.css'), /\.pop\{/);
  assert.match(read('css/hud.css'), /\.chip\.res\{width:184px\}/, 'fixed plaque widths keep the row still');
});

test('the old plaque tips are gone from the tooltip list, so there is one card per plaque', () => {
  const hovers = read('src/ui/hovers.js');
  assert.doesNotMatch(hovers, /'#coins'|'#parts'|'#renewal'/);
});

test('the town plaque grows to fit its name and steps the type down for a long one', () => {
  const css = read('css/hud.css');
  assert.match(css, /\.brand\{width:fit-content;min-width:232px;max-width:\d+px/);
  assert.match(css, /\.brand\[data-len="long"\] \.townnamebtn\{font-size:\d+px\}/);
  assert.match(read('src/ui/hud.js'), /plaque\.dataset\.len/);
});

test('Happiness is a plaque in the top bar with its panel under it, not a card in the left column', () => {
  const html = read('index.html');
  const chips = html.slice(html.indexOf('<div class="chips">'), html.indexOf('<div class="ctrl card">'));
  assert.match(chips, /id="hpchip"/);
  assert.match(chips, /id="hp-panel"/);
  assert.ok(chips.indexOf('id="hpchip"') < chips.indexOf('id="demandw"'), 'Happiness sits before Demand');
  const mod = read('src/ui/modules/happiness.js');
  assert.doesNotMatch(mod, /leftcol/);
  assert.match(mod, /\$\('hpchip'\)/);
  assert.doesNotMatch(read('css/happiness.css'), /#happiness-card/);
});

test('the control cluster keeps pause and speed and moves the other buttons into a hamburger menu', () => {
  const html = read('index.html');
  const ctrl = html.slice(html.indexOf('<div class="ctrl card">'), html.indexOf('<nav class="card menu"'));
  for (const id of ['pause', 'speed', 'menubtn']) assert.match(ctrl, new RegExp('id="' + id + '"'), id);
  assert.doesNotMatch(ctrl, /id="night"|id="settingsbtn"/, 'the bar itself holds only time and the menu button');
  const menu = html.slice(html.indexOf('<nav class="card menu"'), html.indexOf('</header>'));
  assert.match(menu, /id="menugrid"/);
  assert.match(menu, /id="night"/);
  assert.match(menu, /id="settingsbtn"/, 'modules insert their buttons before Settings, inside the grid');
  assert.match(html, /<link rel="stylesheet" href="css\/topbar\.css">/);
  const mod = read('src/ui/modules/menu.js');
  assert.match(mod, /order: 100/);
  assert.match(mod, /achvbtn: 'Milestones'/);
});
