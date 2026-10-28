// Access settings: text size, calm motion and colour-blind-friendly colours for the traffic tint. Kept per browser
// under its own key, so Start over leaves them alone. apply() writes them to the page's root element, where
// css/access.css and the colour variables pick them up; the render side reads the traffic palette from here.
import { createPrefStore } from './prefs.js';

export const ACCESS_KEY = 'nexus.access.v1';
export const ACCESS_SPECS = {
  text: { values: ['normal', 'large', 'larger'], def: 'normal' },
  motion: { values: ['follow', 'calm'], def: 'follow' },       // follow = whatever the computer asks for
  colors: { values: ['standard', 'redgreen', 'blueyellow'], def: 'standard' },
};
export const TEXT_SCALE = { normal: 1, large: 1.12, larger: 1.25 };

// Free, busy, jammed. The colour-blind sets differ in lightness as well as hue, so they still read in greyscale.
export const TRAFFIC_HEX = {
  standard: ['#9DB37C', '#D9B45F', '#B8472E'],
  redgreen: ['#6BA3C9', '#EBD36B', '#5B2C6F'],   // blue, yellow, deep plum
  blueyellow: ['#6FAE7B', '#F0B6B0', '#7A1F2B'], // green, pale pink, wine
};
export const trafficHex = (colors) => TRAFFIC_HEX[colors] || TRAFFIC_HEX.standard;
export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const trafficRgb = (colors) => trafficHex(colors).map(hexRgb);

// True when UI motion should stay still: the player asked for calm, or the computer did.
export function isCalm(a, prefersReduced = false) { return a.motion === 'calm' || (a.motion === 'follow' && !!prefersReduced); }
let current = { motion: 'follow' };
export const calmer = () => {
  let pr = false;
  try { pr = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media */ }
  return isCalm(current, pr);
};

export function applyAccess(a, root) {
  current = a;
  if (!root) return;
  root.dataset.text = a.text;
  root.dataset.motion = a.motion;
  root.dataset.colors = a.colors;
  const [free, busy, jam] = trafficHex(a.colors);
  root.style.setProperty('--tr-free', free);
  root.style.setProperty('--tr-busy', busy);
  root.style.setProperty('--tr-jam', jam);
  root.style.setProperty('--ts', String(TEXT_SCALE[a.text] || 1));
}

export const createAccessStore = (o = {}) => createPrefStore({ key: ACCESS_KEY, specs: ACCESS_SPECS, ...o });
