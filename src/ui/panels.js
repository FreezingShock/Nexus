// Inspect card, tool flyouts and the Settings page. They read sim data and send commands.
import { MAX_LEVEL, income, nextLevelGain, trafficOf } from '../sim/economy.js';
import { PAL } from '../world/palettes.js';
import { costOf, isOpen, partsOf, tableOf } from '../world/paint.js';
import { speciesOf } from '../world/trees.js';
import { $, fmt, fmtAgo } from './format.js';
import { topRight } from './slot.js';
import { book } from './book.js';
import { PAGE_ICONS } from './page-icons.js';
import { mountGraphics } from './graphics.js';
import { mountAtmos } from './atmos.js';
import { mountSound } from './sound-settings.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

// The Settings page's bookmark tabs, each with the tint of its menu cousin (css/topbar.css).
const TABS = [
  { id: 'sky', label: 'Sky', color: '#F6DDA0', icon: PAGE_ICONS.sky, line: 'Season, weather and the time of day.' },
  { id: 'gfx', label: 'Graphics', color: '#D3E4C4', icon: PAGE_ICONS.gfx, line: 'How the town is drawn. Changes show straight away.' },
  { id: 'snd', label: 'Sound', color: '#F2C9BA', icon: PAGE_ICONS.snd, line: 'Music, the bustle of the streets and the little clicks.' },
  { id: 'town', label: 'Town', color: '#D2E3EE', icon: PAGE_ICONS.town, line: 'Saves, copies and a fresh start.' },
];
const tabHead = (t) => `<header class="pg-band" style="--tc:${t.color}"><span class="pg-band-ico">${t.icon}</span><span><b class="h-disp">${t.label}</b><small>${t.line}</small></span></header>`;

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
  // ---- paint: wall, trim and roof swatches for a placed building ----
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const PAINT_ROWS = [['wall', 'Walls'], ['trim', 'Trim'], ['roof', 'Roof']];
  const wornKey = (kind, p) => (kind === 'wall' ? p.pal : kind === 'trim' ? p.trim : p.roof);
  function swatches(kind, p) {
    const table = tableOf(kind), parts = partsOf(kind), cost = costOf(kind, p.rec), now = wornKey(kind, p);
    return Object.keys(parts).map((key) => {
      const e = table[key], color = kind === 'wall' ? e.wall : hex(e.hex), locked = !isOpen(kind, key, s.paintUnlocks);
      const two = kind === 'wall' && e.two ? ' · two-tone' : '';
      const tip = locked ? `${e.name}${two} · ${parts[key]} Parts opens it for good` : key === now ? `${e.name}${two} · on now` : `${e.name}${two} · ${fmt(cost)} coins`;
      const trimDot = kind === 'wall' ? `<i class="trim" style="background:${hex(e.accent)}"></i>` : '';
      return `<button type="button" class="sw${locked ? ' locked' : ''}" data-paint="${kind}" data-key="${key}" aria-pressed="${key === now}" title="${tip}" aria-label="${tip}" style="--sw:${color}">${trimDot}${locked ? `<small>${parts[key]}</small>` : ''}</button>`;
    }).join('');
  }
  function paintHtml(id) {
    const p = sim.paintable(id) && sim.paintOf(id);
    if (!p) return '';
    return `<div class="paint">${PAINT_ROWS.map(([k, name]) => `<div class="ph">${name}</div><div class="swrow">${swatches(k, p)}</div>`).join('')}</div>`;
  }
  function paint(id, kind, key) {
    if (!isOpen(kind, key, s.paintUnlocks)) send({ type: 'unlockPaint', kind, key });
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

  // ---- settings: a notebook page with bookmark tabs for Graphics, Sound and Town ----
  // Town holds the autosave status, export, import, restore and start over. Destructive steps ask first, on the page.
  let actions = null; // what main.js lends the page: stores and save actions
  let asking = null; // a question on the page: { tab, title, text, ok, onOk, danger }
  const townTab = () => {
    const back = actions.backup();
    return `<div class="pg-grid3">
      <section class="pg-box"><h3 class="h-disp">Your town</h3>
        <p>${actions.status()}</p>
        <p class="pg-soft">${sim.state.terrainSeed ? 'Land seed ' + sim.state.terrainSeed + '. Start over or Renewal rolls a new valley.' : 'This town keeps its original land. Start over or Renewal rolls a new valley.'}</p>
        <button class="btn" type="button" data-act="pcv">Preview the offline postcard</button></section>
      <section class="pg-box"><h3 class="h-disp">Keep a copy</h3>
        <p>Export a copy to keep it safe or move it to another computer.</p>
        <div class="nb-btns"><button class="btn" type="button" data-act="exp">Export save</button><button class="btn" type="button" data-act="imp">Import save</button></div>
        ${back ? `<button class="btn" type="button" data-act="rest">Restore the town from ${fmtAgo(back.savedAt)}</button>` : '<p class="pg-soft">No backup yet. Starting over or importing makes one.</p>'}</section>
      <section class="pg-box pg-danger"><h3 class="h-disp">Fresh start</h3>
        <p>Begin again with the small starter village. The current town moves to the backup slot first.</p>
        <button class="btn danger" type="button" data-act="rst">Start over</button></section>
    </div>
    <p class="nb-promise">Your town saves itself in this browser every 45 seconds. Nothing leaves your computer unless you export it.</p>`;
  };
  const askHtml = (q) => `<section class="pg-ask${q.danger ? ' danger' : ''}"><h3 class="h-disp">${q.title}</h3><p>${q.text}</p>
    <div class="nb-btns"><button class="btn" type="button" data-act="no">Not now</button><button class="btn ${q.danger ? 'danger' : 'primary'}" type="button" data-act="yes">${q.ok}</button></div></section>`;
  book.register('settings', {
    title: 'Settings', sub: 'Changes save straight away', c: '#8FB8D6', icon: PAGE_ICONS.settings, tabs: TABS,
    render({ tab }) {
      if (asking && asking.tab !== tab) asking = null;
      const t = TABS.find((x) => x.id === tab);
      if (asking) return askHtml(asking);
      if (!actions) return tabHead(t);
      return tabHead(t) + (tab === 'sky' ? '<div id="atmos" class="pg-sky"></div>' : tab === 'gfx' ? '<div id="gfx" class="pg-gfx"></div>' : tab === 'snd' ? '<div id="snd" class="pg-snd"></div>' : townTab());
    },
    opened({ tab }) {
      if (asking || !actions) return;
      if (tab === 'sky' && actions.calendar) mountAtmos($('atmos'), actions.calendar, sim);
      if (tab === 'gfx' && actions.quality) mountGraphics($('gfx'), actions.quality);
      if (tab === 'snd' && actions.sound) mountSound($('snd'), actions.sound);
    },
    closed() { asking = null; $('settingsbtn').setAttribute('aria-expanded', 'false'); },
    click(e) {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'yes') return asking.onOk();
      if (act === 'no') { asking = null; return book.refresh(); }
      if (act === 'pcv') return actions.previewPostcard();
      if (act === 'exp') return actions.exportSave();
      if (act === 'imp') return actions.importPick();
      if (act === 'rest') {
        const back = actions.backup();
        if (back) askConfirm({ title: 'Go back to the backup?', ok: 'Restore it', onOk: actions.restore,
          text: 'The town from ' + fmtAgo(back.savedAt) + ' comes back. The town you have now moves to the backup slot.' });
      }
      if (act === 'rst') askConfirm({ title: 'Start over?', ok: 'Start over', onOk: actions.reset, danger: true,
        text: 'This clears the town from this browser. The current town moves to the backup slot, so you can still restore it from here.' });
    },
  });
  function showSettings(a) {
    actions = a;
    if (book.current() !== 'settings') book.open('settings'); else book.refresh();
    $('settingsbtn').setAttribute('aria-expanded', 'true');
  }
  // Asks a question on the Settings page, on its Town tab, with two choices. Used by import and the destructive steps.
  function askConfirm(q) {
    if (book.current() !== 'settings') book.open('settings');
    book.pickTab('town');
    asking = { ...q, tab: 'town' };
    book.refresh();
  }
  function hideSettings() { if (book.current() === 'settings') book.close(); }

  return { ui, showInspect, showTree, hideInspect, refreshInspect, setFly, showSettings, askConfirm, hideSettings, settingsOpen: () => book.current() === 'settings' };
}
