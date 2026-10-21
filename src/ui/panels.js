// Inspect card, tool flyouts and the settings card. They read sim data and send commands.
import { ZONES, TOOL_LISTS } from '../sim/catalog.js';
import { MAX_LEVEL, income, nextLevelGain, trafficOf } from '../sim/economy.js';
import { PAL } from '../world/palettes.js';
import { $, fmt } from './format.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

export function createPanels({ sim, send, toast, onClose, setTool }) {
  const s = sim.state;
  const ui = { selected: null };

  // ---- inspect card ----
  function showInspect(id) {
    ui.selected = id;
    const box = $('inspect'), b = sim.building(id), lv = sim.level(id), cost = sim.cost(id);
    box.hidden = false;
    const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
    const maxed = lv >= MAX_LEVEL;
    box.innerHTML = `<button class="x" id="ix" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">${b.name}</h2><div class="sub">${b.floors} floors · ${PAL[b.pal].name} palette</div></div>
    <div class="pad"><div class="lvl">Level ${dots}</div>
    <div class="stats"><div class="stat">Income<b>${income(b.floors, lv)}/s</b></div><div class="stat">Traffic<b>${trafficOf(b.floors)}/min</b></div><div class="stat info">Next level<b>${maxed ? 'Max' : '+' + nextLevelGain(lv) + '%'}</b></div></div>
    <div class="row"><button class="btn primary grow" id="up" ${maxed || s.coins < cost ? 'disabled' : ''}>${maxed ? 'Top level' : 'Upgrade · ' + fmt(cost) + ' coins'}</button><button class="btn" id="mv">Move</button></div></div>`;
    $('ix').onclick = onClose;
    $('up').onclick = () => send({ type: 'upgrade', id });
    $('mv').onclick = () => toast('Move mode comes with the placement grid');
  }
  function hideInspect() { $('inspect').hidden = true; ui.selected = null; }
  // cheap refresh of the upgrade button as coins change
  function refreshInspect() {
    const up = $('up');
    if (!up || ui.selected === null || !sim.alive(ui.selected)) return;
    up.disabled = sim.level(ui.selected) >= MAX_LEVEL || s.coins < sim.cost(ui.selected);
  }

  // ---- flyout ----
  function setFly(tool) {
    const f = $('fly');
    if (!tool || tool === 'bulldoze') { f.hidden = true; return; }
    let h = '';
    if (tool === 'roads') {
      return; // the road tool (src/ui/modules/road-tool.js) fills the flyout itself
    } else if (tool === 'zones') {
      h = `<div class="head"><h3>Zones</h3><span>Paint areas; buildings grow on their own</span></div><div class="grid">` +
        ZONES.map((z, i) => `<button class="opt" aria-pressed="${i === 0}"><div class="sw" style="background:${z[1]}"></div><b>${z[0]}</b><small>Low, medium or high density</small></button>`).join('') + '</div>';
    } else if (tool === 'traffic') {
      const chip = (c, n) => `<span class="opt" style="flex-direction:row;align-items:center;gap:8px"><i style="width:22px;height:12px;border-radius:4px;background:${c};border:1.5px solid #2B2620"></i>${n}</span>`;
      h = `<div class="head"><h3>Traffic flow</h3><span>Roads are tinted by how full they are</span></div><div class="lanes">${chip('#9DB37C', 'Free')}${chip('#D9B45F', 'Busy')}${chip('#B8472E', 'Jammed')}</div>`;
    } else {
      const names = { build: 'Buildings', services: 'Services', parks: 'Parks' };
      h = `<div class="head"><h3>${names[tool]}</h3><span>Pick one, then click the map</span></div><div class="grid">` +
        TOOL_LISTS[tool].map((b, i) => `<button class="opt" aria-pressed="${i === 0}"><b>${b[0]}</b><small>${b[1]}</small><small><b style="color:var(--ink)">${b[2]} coins</b></small></button>`).join('') + '</div>';
    }
    f.innerHTML = h; f.hidden = false;
    f.querySelectorAll('.opt').forEach((b) => {
      b.onclick = () => { b.parentNode.querySelectorAll('.opt').forEach((o) => o.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); };
    });
  }

  // ---- settings ----
  function showSettings({ exportSave, importPick, reset }) {
    const box = $('settings');
    box.hidden = false;
    box.innerHTML = `<button class="x" id="sx" aria-label="Close">${CLOSE_SVG}</button>
    <div class="band"><h2 class="h-disp">Settings</h2><div class="sub">Your town is saved in this browser</div></div>
    <div class="pad"><p class="sub">Autosaves every 45 seconds. Export a copy to keep it safe or move it to another device.</p>
    <button class="btn" id="exp">Export save</button><button class="btn" id="imp">Import save</button>
    <button class="btn danger" id="rst">Start over</button></div>`;
    $('sx').onclick = hideSettings;
    $('exp').onclick = exportSave;
    $('imp').onclick = importPick;
    let armed = false;
    $('rst').onclick = () => {
      if (!armed) { armed = true; $('rst').textContent = 'Tap again to erase this town'; setTimeout(() => { armed = false; const r = $('rst'); if (r) r.textContent = 'Start over'; }, 4000); return; }
      reset();
    };
  }
  function hideSettings() { $('settings').hidden = true; $('settingsbtn').setAttribute('aria-expanded', 'false'); }

  return { ui, showInspect, hideInspect, refreshInspect, setFly, showSettings, hideSettings, settingsOpen: () => !$('settings').hidden };
}
