// DOM side. Reads sim snapshots, sends commands, never mutates sim state directly.
import { $ } from './format.js';
import { createHud } from './hud.js';
import { createPanels } from './panels.js';
import { createPostcard } from './postcard.js';
import { registryOf } from '../core/registry.js';
import { uiModules } from './modules/index.js';
import { TOOL_KEYS } from './shortcuts.js';
import { isNoteEvent } from './notes.js';
import { topRight } from './slot.js';
import { book } from './book.js';
import { beginFlySwitch } from './fly-switch.js';

// S is taken by the camera (WASD), so Services moves to C. Camera keys live in src/render/camera.js and modules/camera-modes.js.
// TOOL_KEYS lives in shortcuts.js so the shortcut sheet lists the same keys.

export function createUi({ sim, scene, actions }) {
  const send = (cmd) => sim.dispatch(cmd);
  let tool = null;
  book.useSound(actions.sound); // the pages' rustle and chimes follow the sound settings

  const hud = createHud({ sim, send, onSettings: () => toggleSettings(), calendar: actions.calendar });
  const panels = createPanels({
    sim, send, toast: hud.toast,
    onClose: () => select(null),
    setTool: (t) => setTool(t),
  });
  const postcard = createPostcard({ sim, send, scene, hud });
  const mods = registryOf('ui modules', uiModules).list().map((d) => d.create({ sim, send, scene, hud, toast: hud.toast, tool: () => tool, setTool: (t) => setTool(t), quality: actions.quality, sound: actions.sound, calendar: actions.calendar, profile: () => actions.profile }) || {});

  function select(id) {
    if (id && !sim.alive(id)) id = null; // only a standing building can be inspected
    scene.select(id);
    if (id) panels.showInspect(id); else panels.hideInspect();
  }
  // The top-right corner holds one surface at a time. The menu, the pages (book.js) and the Happiness panel register
  // themselves; the Inspect card (which also holds a tree's card) is registered here, where its close path lives.
  topRight.register('inspect', { isOpen: () => !$('inspect').hidden, close: () => select(null), el: $('inspect') });
  function selectTree(id) {
    scene.select(null);
    panels.showTree(id);
  }
  function setTool(t) {
    const was = tool;
    tool = t;
    document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    const done = beginFlySwitch($('fly'), was, t);
    panels.setFly(t);
    for (const m of mods) if (m.onTool) m.onTool(t, was);
    done();
  }
  function toggleSettings() {
    if (panels.settingsOpen()) { panels.hideSettings(); return; }
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
    // A page is open: Esc closes it, page keys (M, G, ?) switch pages, and tool keys wait until it is closed.
    if (e.key === 'Escape' && book.isOpen()) { book.close(); return; }
    if (mods.some((m) => m.onKey && m.onKey(e))) return;
    if (book.isOpen()) return;
    const k = e.key.toLowerCase();
    if (TOOL_KEYS[k]) setTool(tool === TOOL_KEYS[k] ? null : TOOL_KEYS[k]);
    else if (e.key === 'Escape') { if (tool) setTool(null); else select(null); }
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
    if (e.text && !sim.hush && !isNoteEvent(e)) hud.toast(e.text, e.kind); // milestones and rewards get a reward strip instead
    for (const m of mods) if (m.onEvent) m.onEvent(e);
    if (e.type === 'upgraded') { scene.pop(e.id); if (panels.ui.selected === e.id) panels.showInspect(e.id); }
    else if (e.type === 'bulldozed') { if (panels.ui.selected === e.id) select(null); }
    if (e.type === 'changed') hud.sync();
  });

  // Right-click with no drag: leave the tool in hand, otherwise close the open card.
  function onCancel() {
    if (book.isOpen()) book.close();
    else if (tool) setTool(null);
    else select(null);
  }

  return {
    tool: () => tool,
    view: () => { const m = mods.find((x) => x.view); return m ? m.view() : 'normal'; },
    onPick, onCancel,
    hud, postcard, toast: hud.toast,
    showPostcard: () => postcard.show(),
    previewPostcard: () => { if (panels.settingsOpen()) panels.hideSettings(); postcard.preview(); },
    // Opens Settings if needed and asks a question inside it (import uses this).
    askConfirm: (opts) => { if (!panels.settingsOpen()) toggleSettings(); panels.askConfirm(opts); },
    frame(dt, t, alpha) {
      const ticked = hud.frame(dt, alpha, false);
      for (const m of mods) if (m.frame) m.frame(dt, t, alpha);
      if (ticked) panels.refreshInspect();
    },
  };
}
