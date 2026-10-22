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
  let shown = null; // the actions the card was opened with, so "Not now" can return to it
  function showSettings(actions) {
    shown = actions;
    const box = $('settings');
    topRight.claim('settings');
    box.hidden = false;
    const back = actions.backup();
    box.innerHTML = `<button class="x" id="sx" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">Settings</h2><div class="sub">Your town is saved in this browser</div></div>
    <div class="pad"><div id="atmos"></div><div id="gfx"></div>
    <div id="snd"></div>
    <p class="sub">${actions.status()}</p>
    <p class="sub">${sim.state.terrainSeed ? 'Land seed ' + sim.state.terrainSeed + '. Start over or Renewal rolls a new valley.' : 'This town keeps its original land. Start over or Renewal rolls a new valley.'}</p>
    <p class="sub">Export a copy to keep it safe or move it to another device.</p>
    <button class="btn" id="exp">Export save</button><button class="btn" id="imp">Import save</button>
    ${back ? `<button class="btn" id="rest">Restore the town from ${fmtAgo(back.savedAt)}</button>` : ''}
    <button class="btn" id="pcv">Preview the offline postcard</button>
    <button class="btn danger" id="rst">Start over</button></div>`;
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
