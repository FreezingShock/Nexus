// The list of UI modules. To add a panel, HUD widget or shortcut, create src/ui/modules/<name>.js and add one line here.
// (Merges with `merge=union` in .gitattributes, so parallel one-line additions rarely conflict.)
//
// A UI module is { id, create(ctx) } where ctx = { sim, send, scene, toast, tool() } and create returns an object
// whose optional hooks are called by ui.js:
//   frame(dt, t, alpha)   every frame
//   onTool(tool, was)     the active tool changed (null when none)
//   onEvent(e)            every sim event ({ type, id?, text? })
//   onKey(e)              keydown outside inputs; return true to claim the key
// Modules read sim snapshots and send commands. They never mutate sim.state.
// Add markup to index.html only inside your own container element, and styles to your own css file.
import zoning from './zoning.js';

export const uiModules = [zoning];
import placement from './placement.js';

export const uiModules = [placement];
