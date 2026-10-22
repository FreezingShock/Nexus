// Shared materials and textures. One material per color; one facade material per palette.
import * as THREE from '../../vendor/three/three.module.min.js';
import { PAL } from '../world/palettes.js';
import { patchSeason } from './season.js';

export const INK = 0x2B2620;

// Three flat tone bands: the toon look from the approved mockup.
const gradient = new THREE.DataTexture(new Uint8Array([150, 195, 235, 255]), 4, 1, THREE.LuminanceFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;

export const lineMat = new THREE.LineBasicMaterial({ color: INK });
export const hullInk = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

// Every toon material takes the season and weather patch (season.js). Tree canopies re-patch with blossom.
export const toonUncached = (color, opts) => patchSeason(new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradient }, opts || {})));
const cache = new Map();
export function toon(color) {
  let m = cache.get(color);
  if (!m) { m = toonUncached(color); cache.set(color, m); }
  return m;
}

export function canvasTexture(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function facadeCanvas(wall) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = wall; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(43,38,32,.10)'; x.fillRect(0, 58, 64, 6);
  x.fillStyle = '#FAF3E4'; x.fillRect(18, 12, 28, 36);
  x.fillStyle = '#7F98A6'; x.fillRect(21, 15, 22, 30);
  x.fillStyle = 'rgba(250,243,228,.9)'; x.fillRect(31, 15, 2, 30); x.fillRect(21, 29, 22, 2);
  x.fillStyle = '#B9AD97'; x.fillRect(16, 48, 32, 4);
  return c;
}
function windowCanvas(glow) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = glow ? '#000' : '#6C7191'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = glow ? '#FFC15E' : '#FFD98A'; x.fillRect(18, 12, 28, 36);
  x.fillStyle = glow ? '#000' : 'rgba(70,52,40,.9)'; x.fillRect(31, 12, 2, 36); x.fillRect(18, 29, 28, 2);
  return c;
}

let night = null;
export function nightFacade() {
  if (!night) {
    night = toonUncached(0xffffff, {
      map: canvasTexture(windowCanvas(false)), emissive: 0xffffff,
      emissiveMap: canvasTexture(windowCanvas(true)), emissiveIntensity: 0.85,
    });
  }
  return night;
}

const facades = {};
// Texture repeat is baked into the UVs, so one material serves every building of a palette.
export function facade(pal) {
  if (!facades[pal]) {
    const m = toonUncached(0xffffff, { map: canvasTexture(facadeCanvas(PAL[pal].wall)) });
    m.userData.night = nightFacade();
    facades[pal] = m;
  }
  return facades[pal];
}
