// Control settings: how fast the camera moves, zooms and turns, whether the wheel zooms the other way, and whether the
// "/ for shortcuts" hint shows. Kept per browser under its own key, so Start over leaves them alone.
import { createPrefStore } from './prefs.js';

export const CONTROLS_KEY = 'nexus.controls.v1';
export const CONTROL_SPECS = {
  panSpeed: { min: 0.5, max: 2, step: 0.25, def: 1 },   // dragging and WASD
  zoomSpeed: { min: 0.5, max: 2, step: 0.25, def: 1 },  // wheel and the zoom keys
  turnSpeed: { min: 0.5, max: 2, step: 0.25, def: 1 },  // Q and E, and shift-drag
  invertZoom: { bool: true, def: false },
  keyHint: { bool: true, def: true },
};

export const createControlsStore = (o = {}) => createPrefStore({ key: CONTROLS_KEY, specs: CONTROL_SPECS, ...o });
