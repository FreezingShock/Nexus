// Inspect card, tool flyouts and the settings card. They read sim data and send commands.
import { MAX_LEVEL, income, nextLevelGain, trafficOf } from '../sim/economy.js';
import { PAL } from '../world/palettes.js';
import { speciesOf } from '../world/trees.js';
import { $, fmt, fmtAgo } from './format.js';
import { mountGraphics } from './graphics.js';
import { tipCard } from './cards.js';

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
    box.hidden = false;
    const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
    const park = !b.floors; // parks are ground: no storeys, so nothing to upgrade
    const maxed = lv >= MAX_LEVEL || park;
    box.innerHTML = `<button class="x" id="ix" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">${b.name}</h2><div class="sub">${park ? 'Park' : b.floors + ' floors'} · ${PAL[b.pal].name} palette</div></div>
    <div class="pad"><div class="lvl">Level ${dots}</div>
    <div class="stats"><div class="stat">Income<b>${income(b.floors, lv)}/s</b></div><div class="stat">Traffic<b>${trafficOf(b.floors)}/min</b></div><div class="stat info">Next level<b>${maxed ? 'Max' : '+' + nextLevelGain(lv) + '%'}</b></div></div>
    <div class="row"><button class="btn primary grow" id="up" ${maxed || s.coins < cost ? 'disabled' : ''}>${park ? 'Finished' : maxed ? 'Top level' : 'Upgrade · ' + fmt(cost) + ' coins'}</button><button class="btn" id="mv">Move</button></div></div>`;
    $('ix').onclick = onClose;
    $('up').onclick = () => send({ type: 'upgrade', id });
    $('mv').onclick = () => toast('Move mode comes with the placement grid');
  }
  // A town tree: a small card with its species and a free bulldoze. Undo brings it back.
  function showTree(id) {
    const t = sim.tree(id);
    if (!t) { hideInspect(); return; }
    ui.selected = null; ui.tree = id;
    const box = $('inspect');
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
  const WRECKING_BALL = '<svg viewBox="0 0 54 54" aria-hidden="true"><line x1="27" y1="2" x2="27" y2="26" stroke="#2B2620" stroke-width="2.5"/><circle cx="27" cy="36" r="15" fill="#E3A08E" stroke="#2B2620" stroke-width="2.5"/><path d="M19 30l6 6M30 27l4 4" stroke="#FBF6EA" stroke-width="2" stroke-linecap="round"/></svg>';
  const legend = (c, n) => `<span class="lchip"><i style="background:${c}"></i>${n}</span>`;
  function setFly(tool) {
    const f = $('fly');
    if (tool === 'traffic') {
      f.innerHTML = `<div class="head"><h3>Traffic flow</h3><span>Roads are tinted by how full they are</span></div><div class="lanes">${legend('#9DB37C', 'Free')}${legend('#D9B45F', 'Busy')}${legend('#B8472E', 'Jammed')}</div>`;
      f.hidden = false;
    } else if (tool === 'bulldoze') {
      f.innerHTML = `<div class="head"><h3>Bulldoze</h3><span>Clear what you no longer need</span></div>` +
        `<div class="bd-head">${WRECKING_BALL}<p>Click a building, or drag over roads, to clear them.</p></div>` +
        `<div class="grid menu-grid">${tipCard({ title: 'Click a building', line: 'Clears that one building' })}` +
        `${tipCard({ title: 'Drag over several', line: 'One drag is one undo step' })}` +
        `${tipCard({ title: 'Bring it back', line: 'Undoes the last clearing', key: 'Ctrl+Z' })}` +
        `${tipCard({ title: 'Stop', line: 'Leaves the tool', key: 'Esc' })}</div>`;
      f.hidden = false;
    } else f.hidden = true;
  }

  // ---- settings ----
  // Autosave status, export, import, restore and start over. Destructive steps ask first, inline.
  let shown = null; // the actions the card was opened with, so "Not now" can return to it
  function showSettings(actions) {
    shown = actions;
    const box = $('settings');
    box.hidden = false;
    const back = actions.backup();
    box.innerHTML = `<button class="x" id="sx" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">Settings</h2><div class="sub">Your town is saved in this browser</div></div>
    <div class="pad"><div id="gfx"></div>
    <p class="sub">${actions.status()}</p>
    <p class="sub">Export a copy to keep it safe or move it to another device.</p>
    <button class="btn" id="exp">Export save</button><button class="btn" id="imp">Import save</button>
    ${back ? `<button class="btn" id="rest">Restore the town from ${fmtAgo(back.savedAt)}</button>` : ''}
    <button class="btn danger" id="rst">Start over</button></div>`;
    $('sx').onclick = hideSettings;
    if (actions.quality) mountGraphics($('gfx'), actions.quality);
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
