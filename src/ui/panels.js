// Inspect card, tool flyouts and the settings card. They read sim data and send commands.
import { MAX_LEVEL, income, nextLevelGain, trafficOf } from '../sim/economy.js';
import { PAL, ROOFS } from '../world/palettes.js';
import { ROOF_PARTS, WALL_PARTS, roofCost, roofOpen, wallCost, wallOpen } from '../world/paint.js';
import { speciesOf } from '../world/trees.js';
import { $, fmt, fmtAgo } from './format.js';
import { topRight } from './slot.js';
import { mountGraphics } from './graphics.js';
import { mountAtmos } from './atmos.js';
import { mountSound } from './sound-settings.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

// The Settings groups, each with the tile colour of its menu cousin (css/topbar.css).
const TABS = [
  { id: 'sky', label: 'Sky', color: '#F6DDA0', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="10" r="3.2"/><path d="M9 3.5v1.4M2.5 10h1.4M4.4 5.4l1 1M13.6 5.4l-1 1M8 20h9.5a3.2 3.2 0 0 0 .3-6.4 4.6 4.6 0 0 0-8.4.8A3 3 0 0 0 8 20z"/></svg>' },
  { id: 'gfx', label: 'Graphics', color: '#D3E4C4', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>' },
  { id: 'snd', label: 'Sound', color: '#F2C9BA', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>' },
  { id: 'town', label: 'Town', color: '#D2E3EE', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5"/></svg>' },
];

export function createPanels({ sim, send, toast, onClose, setTool }) {
  const s = sim.state;
  const ui = { selected: null, tree: null };

  // ---- inspect card ----
  function showInspect(id) {
    const b = sim.building(id);
    if (!b || !sim.alive(id)) { hideInspect(); return; } // a pick with no building behind it closes the card
    ui.selected = id; ui.tree = null;
    const box = $('inspect'), lv = sim.level(id), cost = sim.cost(id);
    topRight.claim('inspect'); // the menu, Settings or Milestones step aside
    box.hidden = false;
    const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
    const park = !b.floors; // parks are ground: no storeys, so nothing to upgrade
    const maxed = lv >= MAX_LEVEL || park;
    box.innerHTML = `<button class="x" id="ix" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">${b.name}</h2><div class="sub">${park ? 'Park' : b.cat === 'farm' ? b.fw * b.fd + ' tiles of fields' : b.floors + ' floors'} · ${PAL[(sim.paintOf(id) || b).pal].name} palette</div></div>
    <div class="pad"><div class="lvl">Level ${dots}</div>
    <div class="stats"><div class="stat">Income<b>${b.income ?? income(b.floors, lv)}/s</b></div><div class="stat">Traffic<b>${trafficOf(b.floors)}/min</b></div><div class="stat info">Next level<b>${maxed ? 'Max' : '+' + nextLevelGain(lv) + '%'}</b></div></div>
    <div class="row"><button class="btn primary grow" id="up" ${maxed || s.coins < cost ? 'disabled' : ''}>${park ? 'Finished' : maxed ? 'Top level' : 'Upgrade · ' + fmt(cost) + ' coins'}</button><button class="btn" id="mv">Move</button></div>${paintHtml(id)}</div>`;
    $('ix').onclick = onClose;
    box.querySelectorAll('[data-paint]').forEach((el) => { el.onclick = () => paint(id, el.dataset.paint, el.dataset.key); });
    $('up').onclick = () => send({ type: 'upgrade', id });
    $('mv').onclick = () => toast('Move mode comes with the placement grid');
  }
  // ---- paint: wall and roof swatches for a placed building ----
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  function swatches(kind, id, rec) {
    const wall = kind === 'wall', table = wall ? WALL_PARTS : ROOF_PARTS, open = wall ? wallOpen : roofOpen, cost = wall ? wallCost(rec) : roofCost(rec);
    return Object.keys(table).map((key) => {
      const color = wall ? PAL[key].wall : hex(ROOFS[key].hex), name = wall ? PAL[key].name : ROOFS[key].name;
      const locked = !open(key, s.paintUnlocks), now = (wall ? rec.pal : rec.roof) === key;
      const tip = locked ? `${name} · ${table[key]} Parts opens it for good` : now ? `${name} · on now` : `${name} · ${fmt(cost)} coins`;
      return `<button type="button" class="sw${locked ? ' locked' : ''}" data-paint="${kind}" data-key="${key}" aria-pressed="${now}" title="${tip}" aria-label="${tip}" style="--sw:${color}">${locked ? `<small>${table[key]}</small>` : ''}</button>`;
    }).join('');
  }
  function paintHtml(id) {
    const p = sim.paintOf(id);
    if (!p) return '';
    return `<div class="paint"><div class="ph">Walls</div><div class="swrow">${swatches('wall', id, p.rec)}</div><div class="ph">Roof</div><div class="swrow">${swatches('roof', id, p.rec)}</div></div>`;
  }
  function paint(id, kind, key) {
    const open = kind === 'wall' ? wallOpen : roofOpen;
    if (!open(key, s.paintUnlocks)) send({ type: 'unlockPaint', kind, key });
    else send({ type: 'paintBuilding', id, [kind]: key });
    showInspect(id);
  }
  // A town tree: a small card with its species and a free bulldoze. Undo brings it back.
  function showTree(id) {
    const t = sim.tree(id);
    if (!t) { hideInspect(); return; }
    ui.selected = null; ui.tree = id;
    const box = $('inspect');
    topRight.claim('inspect');
    box.hidden = false;
    box.innerHTML = `<button class="x" id="ix" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">${speciesOf(t)}</h2><div class="sub">${t.k === 'p' ? 'Conifer' : 'Broadleaf'} · a town tree</div></div>
    <div class="pad"><p class="sub">Trees give way when their ground is zoned, built on or paved. Undo brings one back.</p>
    <div class="row"><button class="btn grow" id="trc">Bulldoze tree · free</button></div></div>`;
    $('ix').onclick = onClose;
    $('trc').onclick = () => { send({ type: 'removeTree', id }); onClose(); };
  }
  function hideInspect() { $('inspect').hidden = true; ui.selected = null; ui.tree = null; }
  // cheap refresh of the upgrade button as coins change
  function refreshInspect() {
    if (ui.tree !== null) { if (!sim.tree(ui.tree)) onClose(); return; } // a tree that was cleared or undone: close the card
    const up = $('up');
    if (!up || ui.selected === null) return;
    const b = sim.building(ui.selected);
    if (!b || !sim.alive(ui.selected)) { onClose(); return; } // demolished, undone or renewed away: close, don't keep a stale card
    up.disabled = sim.level(ui.selected) >= MAX_LEVEL || !b.floors || s.coins < sim.cost(ui.selected);
  }

  // ---- flyout ----
  // Roads, Zones, Districts, Buildings, Services and Parks fill the flyout themselves (their modules render it when they
  // open). This function fills it for Traffic and Bulldoze, and hides it for every other tool.
  const legend = (c, n) => `<span class="lchip"><i style="background:${c}"></i>${n}</span>`;
  // Bulldoze has no menu: a single hint chip above the toolbar says what the tool does.
  const BULLDOZE_HINT = 'Click a building or tree, or drag over roads · Ctrl+Z brings it back · Esc stops';
  function setFly(tool) {
    const f = $('fly');
    f.classList.remove('bdchip');
    if (tool === 'traffic') {
      f.innerHTML = `<div class="rhead"><b class="ptitle">Traffic</b><span class="rhint">Roads are tinted by how full they are</span></div><div class="lanes">${legend('#9DB37C', 'Free')}${legend('#D9B45F', 'Busy')}${legend('#B8472E', 'Jammed')}</div>`;
      f.hidden = false;
    } else if (tool === 'bulldoze') {
      f.innerHTML = `<span class="bdtext">${BULLDOZE_HINT}</span>`;
      f.classList.add('bdchip');
      f.hidden = false;
    } else f.hidden = true;
  }

  // ---- settings ----
  // Autosave status, export, import, restore and start over. Destructive steps ask first, inline.
  let settingsTab = 'sky'; // the group shown, remembered while the page is open
  let shown = null; // the actions the card was opened with, so "Not now" can return to it
  function showSettings(actions) {
    shown = actions;
    const box = $('settings');
    topRight.claim('settings');
    box.hidden = false;
    const back = actions.backup();
    const tab = TABS.some((t) => t.id === settingsTab) ? settingsTab : TABS[0].id;
    const tabs = TABS.map((t) => `<button class="stab" role="tab" id="st-${t.id}" data-tab="${t.id}" aria-selected="${String(t.id === tab)}" aria-controls="sp-${t.id}" style="--tc:${t.color}">${t.icon}<span>${t.label}</span></button>`).join('');
    const pane = (id, inner) => `<div class="spane" role="tabpanel" id="sp-${id}" aria-labelledby="st-${id}" style="--tc:${TABS.find((t) => t.id === id).color}"${id === tab ? '' : ' hidden'}>${inner}</div>`;
    box.innerHTML = `<button class="x" id="sx" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">Settings</h2><div class="sub">Your town is saved in this browser</div></div>
    <div class="stabs" role="tablist" aria-label="Settings groups">${tabs}</div>
    <div class="pad">
    ${pane('sky', '<div id="atmos"></div>')}
    ${pane('gfx', '<div id="gfx"></div>')}
    ${pane('snd', '<div id="snd"></div>')}
    ${pane('town', `<section class="sbox"><h3 class="h-disp">Your town</h3>
      <p class="sub">${actions.status()}</p>
      <p class="sub">${sim.state.terrainSeed ? 'Land seed ' + sim.state.terrainSeed + '. Start over or Renewal rolls a new valley.' : 'This town keeps its original land. Start over or Renewal rolls a new valley.'}</p>
      <button class="btn" id="pcv">Preview the offline postcard</button></section>
      <section class="sbox"><h3 class="h-disp">Keep a copy</h3>
      <p class="sub">Export a copy to keep it safe or move it to another device.</p>
      <div class="sbtns"><button class="btn" id="exp">Export save</button><button class="btn" id="imp">Import save</button></div>
      ${back ? `<button class="btn" id="rest">Restore the town from ${fmtAgo(back.savedAt)}</button>` : ''}</section>
      <section class="sbox sdanger"><h3 class="h-disp">Fresh start</h3>
      <p class="sub">The current town moves to the backup slot first.</p>
      <button class="btn danger" id="rst">Start over</button></section>`)}
    </div>`;
    const pick = (id) => {
      settingsTab = id;
      for (const b of box.querySelectorAll('.stab')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
      for (const t of TABS) box.querySelector('#sp-' + t.id).hidden = t.id !== id;
    };
    box.querySelector('.stabs').onclick = (e) => { const b = e.target.closest('.stab'); if (b) pick(b.dataset.tab); };
    box.querySelector('.stabs').onkeydown = (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const i = TABS.findIndex((t) => t.id === settingsTab), n = TABS[(i + d + TABS.length) % TABS.length].id;
      pick(n); box.querySelector('#st-' + n).focus();
    };
    $('pcv').onclick = actions.previewPostcard;
    $('sx').onclick = hideSettings;
    if (actions.calendar) mountAtmos($('atmos'), actions.calendar, sim);
    if (actions.quality) mountGraphics($('gfx'), actions.quality);
    if (actions.sound) mountSound($('snd'), actions.sound);
    $('exp').onclick = actions.exportSave;
    $('imp').onclick = actions.importPick;
    if (back) $('rest').onclick = () => askConfirm({
      title: 'Go back to the backup?', ok: 'Restore it', onOk: actions.restore,
      text: 'The town from ' + fmtAgo(back.savedAt) + ' comes back. The town you have now moves to the backup slot.',
    });
    $('rst').onclick = () => askConfirm({
      title: 'Start over?', ok: 'Start over', onOk: actions.reset, danger: true,
      text: 'This clears the town from this browser. The current town moves to the backup slot, so you can still restore it from here.',
    });
  }
  // Replaces the settings body with a question and two choices. Used by import and the destructive steps above.
  function askConfirm({ title, text, ok, onOk, danger = false }) {
    const box = $('settings');
    topRight.claim('settings');
    box.hidden = false;
    box.innerHTML = `<button class="x" id="sx" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">${title}</h2></div>
    <div class="pad"><p class="sub">${text}</p>
    <button class="btn ${danger ? 'danger' : 'primary'}" id="cy">${ok}</button><button class="btn" id="cn">Not now</button></div>`;
    $('sx').onclick = hideSettings;
    $('cn').onclick = () => showSettings(shown);
    $('cy').onclick = onOk;
  }
  function hideSettings() { $('settings').hidden = true; $('settingsbtn').setAttribute('aria-expanded', 'false'); }

  return { ui, showInspect, showTree, hideInspect, refreshInspect, setFly, showSettings, askConfirm, hideSettings, settingsOpen: () => !$('settings').hidden };
}
