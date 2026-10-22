// Materials for the building kit. Colors ride on vertex colors, so every plain-colored part of every building
// shares ONE material (one draw call). Only the textured wall styles need their own materials.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { PAL, TRIMS } from '../../world/palettes.js';
import { toonUncached, canvasTexture } from '../materials.js';

// Same three flat tone bands as the rest of the town, driven by vertex color instead of a per-color material.
let vc = null;
export function toonVC() {
  if (!vc) {
    vc = toonUncached(0xffffff, { vertexColors: true });
    vc.userData.kitVC = true;
  }
  return vc;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// One 64 px cell is one bay wide and one storey tall; the wall's UVs repeat it.
function cell(style, wall, accent, mode) {
  const glow = mode === 'glow', dusk = mode === 'night', dim = mode === 'dim';
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const pane = glow ? '#FFC15E' : dusk ? '#FFD98A' : dim ? '#454C70' : '#7F98A6', bar = glow ? '#000' : dusk ? 'rgba(70,52,40,.9)' : dim ? 'rgba(34,30,48,.85)' : 'rgba(250,243,228,.9)';
  x.fillStyle = glow ? '#000' : wall; x.fillRect(0, 0, 64, 64);
  if (!glow) { x.fillStyle = 'rgba(43,38,32,.10)'; x.fillRect(0, 58, 64, 6); }
  if (style === 'ribbon') {
    x.fillStyle = glow ? '#000' : '#FAF3E4'; x.fillRect(4, 14, 56, 30);
    x.fillStyle = pane; x.fillRect(6, 16, 52, 26);
    x.fillStyle = bar; x.fillRect(19, 16, 2, 26); x.fillRect(31, 16, 2, 26); x.fillRect(43, 16, 2, 26);
    x.fillStyle = glow ? '#000' : '#B9AD97'; x.fillRect(2, 44, 60, 4);
  } else if (style === 'arched') {
    x.fillStyle = glow ? '#000' : '#FAF3E4';
    x.beginPath(); x.moveTo(17, 50); x.lineTo(17, 24); x.arc(32, 24, 15, Math.PI, 0); x.lineTo(47, 50); x.closePath(); x.fill();
    x.fillStyle = pane;
    x.beginPath(); x.moveTo(20, 48); x.lineTo(20, 24); x.arc(32, 24, 12, Math.PI, 0); x.lineTo(44, 48); x.closePath(); x.fill();
    x.fillStyle = bar; x.fillRect(31, 12, 2, 36); x.fillRect(20, 30, 24, 2);
    x.fillStyle = glow ? '#000' : '#B9AD97'; x.fillRect(15, 50, 34, 4);
  } else if (style === 'shutter') {
    x.fillStyle = glow ? '#000' : '#FAF3E4'; x.fillRect(20, 14, 24, 32);
    x.fillStyle = pane; x.fillRect(22, 16, 20, 28);
    x.fillStyle = bar; x.fillRect(31, 16, 2, 28); x.fillRect(22, 29, 20, 2);
    x.fillStyle = glow ? '#000' : accent; x.fillRect(10, 14, 8, 32); x.fillRect(46, 14, 8, 32);
    x.fillStyle = glow ? '#000' : '#B9AD97'; x.fillRect(18, 48, 28, 4);
  } else { // sash: the original look
    x.fillStyle = glow ? '#000' : '#FAF8F3'; x.fillRect(18, 12, 28, 36);
    x.fillStyle = pane; x.fillRect(21, 15, 22, 30);
    x.fillStyle = bar; x.fillRect(31, 15, 2, 30); x.fillRect(21, 29, 22, 2);
    x.fillStyle = glow ? '#000' : '#B9AD97'; x.fillRect(16, 48, 32, 4);
  }
  return c;
}

const cache = new Map();
const nightCache = new Map();

// Night walls: lit windows through the emissive map. Shared across palettes (the dark wall is the same at night).
export function nightStyle(style) {
  let m = nightCache.get(style);
  if (!m) {
    m = toonUncached(0xffffff, { map: canvasTexture(cell(style, '#6C7191', '#6C7191', 'night')), emissive: 0xffffff, emissiveMap: canvasTexture(cell(style, '#000', '#000', 'glow')), emissiveIntensity: 0.85 });
    nightCache.set(style, m);
  }
  return m;
}

// Night walls with dark windows. The town draws its own glow over each window that is lit (render/systems/life-windows.js),
// so a window can come on at its own time. The postcard's dusk plate has no such layer and keeps the lit walls above.
const dimCache = new Map();
export function dimStyle(style) {
  let m = dimCache.get(style);
  if (!m) {
    m = toonUncached(0xffffff, { map: canvasTexture(cell(style, '#6C7191', '#6C7191', 'dim')) });
    dimCache.set(style, m);
  }
  return m;
}
// The material a wall wears at night in the town: dark windows when a dim variant exists, the lit walls otherwise.
export const nightWall = (m) => m.userData.nightDim || m.userData.night;

// Textured wall material for a palette and window style. Texture repeat is baked into the UVs.
export function wallStyle(pal, style, trim = null) {
  const key = pal + '/' + style + (trim ? '/' + trim : '');
  let m = cache.get(key);
  if (!m) {
    const P = PAL[pal];
    if (typeof document === 'undefined') { m = toonUncached(0xffffff); } // node tests: no canvas, same interface
    else {
      m = toonUncached(0xffffff, { map: canvasTexture(cell(style, P.wall, hex(trim ? TRIMS[trim].hex : P.accent), 'day')) });
      m.userData.night = nightStyle(style);
      m.userData.nightDim = dimStyle(style);
    }
    cache.set(key, m);
  }
  return m;
}
