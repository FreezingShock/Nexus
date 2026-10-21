// DOM side. Reads sim snapshots, sends commands, never mutates sim state directly.
import { $ } from './format.js';
import { createHud } from './hud.js';
import { createPanels } from './panels.js';
import { createPostcard } from './postcard.js';

const TOOL_KEYS = { r: 'roads', z: 'zones', b: 'build', s: 'services', p: 'parks', t: 'traffic', x: 'bulldoze' };

export function createUi({ sim, scene, actions }) {
  const send = (cmd) => sim.dispatch(cmd);
  let tool = null;

  const hud = createHud({ sim, send, onSettings: () => toggleSettings() });
  const panels = createPanels({
    sim, send, toast: hud.toast,
    onClose: () => select(null),
    setTool: (t) => setTool(t),
  });
  const postcard = createPostcard({ sim, send, scene });

  function select(id) {
    scene.select(id);
    if (id) panels.showInspect(id); else panels.hideInspect();
  }
  function setTool(t) {
    const was = tool;
    tool = t;
    document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    panels.setFly(t);
    if (t === 'roads') scene.focus(-12, 0); else if (was === 'roads') scene.focus(0, 0);
    if (t === 'bulldoze') hud.toast('Bulldoze: click a building to remove it');
  }
  function toggleSettings() {
    if (panels.settingsOpen()) { panels.hideSettings(); return; }
    select(null);
    $('settingsbtn').setAttribute('aria-expanded', 'true');
    panels.showSettings(actions);
  }

  // the canvas reports a click; this decides what it means
  function onPick(id) {
    if (!id) { select(null); return; }
    if (tool === 'bulldoze') { send({ type: 'bulldoze', id }); return; }
    select(id);
  }

  document.querySelectorAll('.tool').forEach((b) => { b.onclick = () => setTool(tool === b.dataset.tool ? null : b.dataset.tool); });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q') scene.rotate(-1); else if (k === 'e') scene.rotate(1);
    else if (TOOL_KEYS[k]) setTool(tool === TOOL_KEYS[k] ? null : TOOL_KEYS[k]);
    else if (e.key === 'Escape') { if (panels.settingsOpen()) panels.hideSettings(); else if (tool) setTool(null); else select(null); }
  });

  // sim events -> feedback
  sim.subscribe((e) => {
    if (e.text) hud.toast(e.text);
    if (e.type === 'upgraded') { scene.pop(e.id); if (panels.ui.selected === e.id) panels.showInspect(e.id); }
    else if (e.type === 'bulldozed') { if (panels.ui.selected === e.id) select(null); }
    else if (e.type === 'roadBuilt') panels.setFly('roads');
    if (e.type === 'changed') hud.sync();
  });

  return {
    tool: () => tool,
    onPick,
    hud, postcard, toast: hud.toast,
    showPostcard: () => postcard.show(),
    frame(dt, t, alpha) {
      const ticked = hud.frame(dt, alpha, false);
      if (ticked) panels.refreshInspect();
    },
  };
}
