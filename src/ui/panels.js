// Inspect card, tool flyouts and the settings card. They read sim data and send commands.
import { ROAD_TYPES, RING_ROAD_TILES, ZONES, TOOL_LISTS } from '../sim/catalog.js';
import { MAX_LEVEL, income, nextLevelGain, trafficOf } from '../sim/economy.js';
import { PAL } from '../world/palettes.js';
import { $, fmt } from './format.js';

const ROAD_SVG = {
  two: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="9" width="120" height="20" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="5" fill="#DDD3C0" stroke="#2B2620"/><rect x="0" y="29" width="120" height="4" fill="#DDD3C0" stroke="#2B2620"/><line x1="0" y1="19" x2="120" y2="19" stroke="#FAF3E4" stroke-width="2" stroke-dasharray="8 6"/></svg>',
  bike: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="6" fill="#BFD8C4" stroke="#2B2620"/><rect x="0" y="24" width="120" height="6" fill="#BFD8C4" stroke="#2B2620"/><line x1="0" y1="17" x2="120" y2="17" stroke="#FAF3E4" stroke-width="2" stroke-dasharray="8 6"/></svg>',
  one: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#8E8576" stroke="#2B2620" stroke-width="1.5"/><path d="M16 17H46M38 11L46 17L38 23M64 17H94M86 11L94 17L86 23" stroke="#FAF3E4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  bus: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#B5AB98" stroke="#2B2620" stroke-width="1.5"/><rect x="0" y="4" width="120" height="7" fill="#EBD9A0" stroke="#2B2620"/></svg>',
  free: '<svg width="100%" height="34" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="4" width="120" height="26" fill="#B5AB98" stroke="#2B2620" stroke-width="1.5"/><line x1="0" y1="17" x2="120" y2="17" stroke="#2B2620" stroke-width="2.5"/></svg>',
};
const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';

export function createPanels({ sim, send, toast, onClose, setTool }) {
  const s = sim.state;
  const ui = { road: 'two', lane: { bike: false, dir: true }, selected: null };

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
    if (!tool || tool === 'bulldoze' || tool === 'zones') { f.hidden = true; return; } // zones: src/ui/modules/zoning.js fills the flyout
    let h = '';
    if (tool === 'roads') {
      const t = ROAD_TYPES.find((r) => r.id === ui.road), total = RING_ROAD_TILES * t.cost;
      h = `<div class="head"><h3>Road type</h3><span>Ring road · ${RING_ROAD_TILES} tiles · <b style="color:var(--ink)">${fmt(total)} coins</b></span></div><div class="grid">` +
        ROAD_TYPES.map((r) => `<button class="opt${r.locked ? ' locked' : ''}" data-road="${r.id}" aria-pressed="${ui.road === r.id}">${ROAD_SVG[r.id]}<b>${r.name}</b><small>${r.sub}</small>${r.locked ? '' : `<small><b style="color:var(--ink)">${r.cost} coins</b> per tile</small>`}</button>`).join('') +
        `</div><div class="lanes"><span class="sub" style="margin:0">Lanes</span><button class="tog" data-lane="dir" aria-pressed="${ui.lane.dir}">Two directions</button><button class="tog" data-lane="bike" aria-pressed="${ui.lane.bike}">Bike lane</button><button class="tog" disabled>Bus lane · 600 Parts</button><span style="flex:1"></span><button class="btn" id="cancelRoad">${s.ringRoad ? 'Close' : 'Cancel'}</button><button class="btn primary" id="buildRoad" ${s.ringRoad ? 'disabled' : ''}>${s.ringRoad ? 'Ring road built' : 'Build road · ' + fmt(total) + ' coins'}</button></div>`;
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
    f.querySelectorAll('[data-road]').forEach((b) => {
      b.onclick = () => {
        const r = ROAD_TYPES.find((x) => x.id === b.dataset.road);
        if (r.locked) { toast('Needs ' + r.sub.replace('Locked · ', '') + ' to unlock'); return; }
        ui.road = r.id; setFly('roads');
      };
    });
    f.querySelectorAll('[data-lane]').forEach((b) => {
      b.onclick = () => { ui.lane[b.dataset.lane] = !ui.lane[b.dataset.lane]; b.setAttribute('aria-pressed', ui.lane[b.dataset.lane]); };
    });
    f.querySelectorAll('.opt:not([data-road])').forEach((b) => {
      b.onclick = () => { b.parentNode.querySelectorAll('.opt').forEach((o) => o.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); };
    });
    const br = $('buildRoad'); if (br) br.onclick = () => { send({ type: 'buildRoad', roadType: ui.road }); setFly('roads'); };
    const cr = $('cancelRoad'); if (cr) cr.onclick = () => setTool(null);
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
