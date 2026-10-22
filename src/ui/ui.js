// DOM side. Reads sim snapshots, sends commands, never mutates sim state directly.
import { $ } from './format.js';
import { createHud } from './hud.js';
import { createPanels } from './panels.js';
import { createPostcard } from './postcard.js';
import { registryOf } from '../core/registry.js';
import { uiModules } from './modules/index.js';
import { TOOL_KEYS } from './shortcuts.js';
import { isNoteEvent } from './notes.js';

// S is taken by the camera (WASD), so Services moves to C. Camera keys live in src/render/camera.js and modules/camera-modes.js.
// TOOL_KEYS lives in shortcuts.js so the shortcut sheet lists the same keys.

export function createUi({ sim, scene, actions }) {
  const send = (cmd) => sim.dispatch(cmd);
  let tool = null;

  const hud = createHud({ sim, send, onSettings: () => toggleSettings(), calendar: actions.calendar });
  const panels = createPanels({
    sim, send, toast: hud.toast,
    onClose: () => select(null),
    setTool: (t) => setTool(t),
  });
  const postcard = createPostcard({ sim, send, scene });
  const mods = registryOf('ui modules', uiModules).list().map((d) => d.create({ sim, send, scene, toast: hud.toast, tool: () => tool, quality: actions.quality }) || {});

  function select(id) {
    if (id && !sim.alive(id)) id = null; // only a standing building can be inspected
    scene.select(id);
    if (id) panels.showInspect(id); else panels.hideInspect();
  }
  function selectTree(id) {
    scene.select(null);
    panels.showTree(id);
  }
  function setTool(t) {
    const was = tool;
    tool = t;
    document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    panels.setFly(t);
    for (const m of mods) if (m.onTool) m.onTool(t, was);
  }
  function toggleSettings() {
    if (panels.settingsOpen()) { panels.hideSettings(); return; }
    select(null);
    $('settingsbtn').setAttribute('aria-expanded', 'true');
    panels.showSettings(actions);
  }

  // the canvas reports a click; this decides what it means. A tree comes as { tree: id }, a building as its id.
  function onPick(hit) {
    if (!hit) { select(null); return; }
    if (typeof hit === 'object') {
      if (tool === 'bulldoze') { send({ type: 'removeTree', id: hit.tree }); select(null); return; }
      selectTree(hit.tree);
      return;
    }
    if (tool === 'bulldoze') { send({ type: 'bulldoze', id: hit }); return; }
    select(hit);
  }

  document.querySelectorAll('.tool').forEach((b) => { b.onclick = () => setTool(tool === b.dataset.tool ? null : b.dataset.tool); });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (mods.some((m) => m.onKey && m.onKey(e))) return;
    const k = e.key.toLowerCase();
    if (TOOL_KEYS[k]) setTool(tool === TOOL_KEYS[k] ? null : TOOL_KEYS[k]);
    else if (e.key === 'Escape') { if (panels.settingsOpen()) panels.hideSettings(); else if (tool) setTool(null); else select(null); }
  });

  // The game is not a web page: no browser menu (Save image and so on) over the town or its cards.
  // Text fields keep their own menu so copy and paste still work.
  addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    e.preventDefault();
  });
  // The header wraps on narrow screens, so the floating cards start below whatever height it has.
  const header = document.querySelector('header.top');
  if (header && window.ResizeObserver) {
    new ResizeObserver(() => document.documentElement.style.setProperty('--hud-bottom', header.offsetTop + header.offsetHeight + 'px')).observe(header);
  }

  // sim events -> feedback
  sim.subscribe((e) => {
    if (e.text && !isNoteEvent(e)) hud.toast(e.text); // milestones and rewards get a postcard note instead
    for (const m of mods) if (m.onEvent) m.onEvent(e);
    if (e.type === 'upgraded') { scene.pop(e.id); if (panels.ui.selected === e.id) panels.showInspect(e.id); }
    else if (e.type === 'bulldozed') { if (panels.ui.selected === e.id) select(null); }
    if (e.type === 'changed') hud.sync();
  });

  // Right-click with no drag: leave the tool in hand, otherwise close the open card.
  function onCancel() {
    if (tool) setTool(null);
    else if (panels.settingsOpen()) panels.hideSettings();
    else select(null);
  }

  return {
    tool: () => tool,
    onPick, onCancel,
    hud, postcard, toast: hud.toast,
    showPostcard: () => postcard.show(),
    // Opens Settings if needed and asks a question inside it (import uses this).
    askConfirm: (opts) => { if (!panels.settingsOpen()) toggleSettings(); panels.askConfirm(opts); },
    frame(dt, t, alpha) {
      const ticked = hud.frame(dt, alpha, false);
      for (const m of mods) if (m.frame) m.frame(dt, t, alpha);
      if (ticked) panels.refreshInspect();
    },
  };
}
