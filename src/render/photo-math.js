// Photo and cinematic mode, the parts that need no browser: filters, viewpoints, frames, the settings clamp, the slow
// camera paths and the file name. The DOM panel is src/ui/modules/photo.js; the camera lens is in camera.js.
import { ISO, TOWN_LIMIT, clamp } from './camera-math.js';

// Filters are plain CSS filter strings. The live view puts one on the canvas; a saved photo draws through the same string
// (canvas 2D `filter`), so what you see is what you save. No extra render passes.
export const FILTERS = [
  { id: 'none', name: 'Natural', css: '' },
  { id: 'film', name: 'Warm film', css: 'sepia(.22) saturate(1.15) contrast(1.06) brightness(1.03) hue-rotate(-6deg)' },
  { id: 'postcard', name: 'Old postcard', css: 'sepia(.55) saturate(.8) contrast(.94) brightness(1.06)' },
  { id: 'golden', name: 'Golden hour', css: 'sepia(.32) saturate(1.35) hue-rotate(-12deg) brightness(1.04) contrast(1.05)' },
  { id: 'ink', name: 'Ink sketch', css: 'grayscale(1) contrast(1.7) brightness(1.12) sepia(.18)' },
  { id: 'mono', name: 'Black and white', css: 'grayscale(1) contrast(1.1)' },
  { id: 'moon', name: 'Moonlit', css: 'saturate(.7) hue-rotate(14deg) brightness(.94) contrast(1.05)' },
];

// Viewpoints. `lens` 'ortho' is the game's own view; 'persp' uses the photo lens at `fov` degrees. `elev` is the tilt in
// radians (0 is level with the street, about 1.4 is straight down), `zoom` the view's zoom.
export const VIEWPOINTS = [
  { id: 'postcard', name: 'Postcard', lens: 'ortho', elev: ISO.elev, zoom: 1, fov: 38 },
  { id: 'bird', name: "Bird's eye", lens: 'persp', elev: 1.3, zoom: 1, fov: 42 },
  { id: 'low', name: 'Low angle', lens: 'persp', elev: 0.3, zoom: 1.4, fov: 46 },
  { id: 'street', name: 'Street level', lens: 'persp', elev: 0.1, zoom: 2.8, fov: 62 },
  { id: 'elevation', name: 'Side on', lens: 'ortho', elev: ISO.elevMin, zoom: 1.2, fov: 38 },
];

export const FRAMES = [
  { id: 'none', name: 'No frame' },
  { id: 'paper', name: 'Paper edge' },
  { id: 'polaroid', name: 'Snapshot' },
];

export const CINEMATICS = [
  { id: 'orbit', name: 'Slow orbit' },
  { id: 'drift', name: 'Drift' },
  { id: 'rise', name: 'Rise and fall' },
];

export const LOW_TILT = 0.06; // the lowest tilt photo mode allows: eye level with the street

export const DEFAULTS = { viewpoint: 'postcard', filter: 'none', frame: 'none', vignette: 0.25, hourOn: false, hour: 15, dayPass: false, cine: 'orbit', speed: 1 };

const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);
const num = (v, lo, hi, fallback) => (Number.isFinite(+v) && v !== '' && v !== null ? clamp(+v, lo, hi) : fallback);

// Settings from anything (a stored string, a slider): every field valid, unknown keys dropped.
export function cleanPhoto(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    viewpoint: pick(VIEWPOINTS, r.viewpoint, DEFAULTS.viewpoint),
    filter: pick(FILTERS, r.filter, DEFAULTS.filter),
    frame: pick(FRAMES, r.frame, DEFAULTS.frame),
    vignette: num(r.vignette, 0, 1, DEFAULTS.vignette),
    hourOn: r.hourOn === true,
    hour: num(r.hour, 0, 24, DEFAULTS.hour) % 24,
    dayPass: r.dayPass === true,
    cine: pick(CINEMATICS, r.cine, DEFAULTS.cine),
    speed: num(r.speed, 0.25, 3, DEFAULTS.speed),
  };
}

export const filterCss = (id) => (FILTERS.find((f) => f.id === id) || FILTERS[0]).css;
export const viewpointOf = (id) => VIEWPOINTS.find((v) => v.id === id) || VIEWPOINTS[0];

// The camera's targets for a cinematic move, `t` seconds after it began. `base` is where the camera was: { tx, tz, az, elev }.
// Every move is a smooth loop around the base, so it can run as long as you like and never leaves the town.
export function cinePose(kind, t, base, speed = 1) {
  const s = t * speed;
  const keep = (v) => clamp(v, -TOWN_LIMIT, TOWN_LIMIT);
  if (kind === 'drift') {
    return {
      tx: keep(base.tx + 18 * Math.sin(s * 0.11)), tz: keep(base.tz + 14 * Math.sin(s * 0.07 + 1)),
      az: base.az + 0.35 * Math.sin(s * 0.05), elev: base.elev,
    };
  }
  if (kind === 'rise') {
    const mid = clamp(base.elev, 0.35, 1.0);
    return { tx: base.tx, tz: base.tz, az: base.az + s * 0.05, elev: clamp(mid + 0.28 * Math.sin(s * 0.09), LOW_TILT, ISO.elevMax) };
  }
  return { tx: base.tx, tz: base.tz, az: base.az + s * 0.12, elev: base.elev }; // orbit: a full turn in about a minute
}

// "Let the day pass": the hour sweeps round the clock, one full day in about 80 seconds at speed 1.
export const cineHour = (start, t, speed = 1) => ((start + t * speed * 0.3) % 24 + 24) % 24;

export function clockLabel(hour) {
  const m = Math.round(hour * 60) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// nexus-<town>-<YYYY-MM-DD-HHMM>.png, safe on any file system.
export function photoFileName(town, when = new Date()) {
  const slug = String(town || 'town').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'town';
  const p = (n) => String(n).padStart(2, '0');
  return `nexus-${slug}-${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}.png`;
}

// Border widths for a frame on a photo of w by h, in pixels. The saved image grows by these, so the town is never cropped.
export function frameMargins(frame, w, h) {
  const u = Math.round(Math.min(w, h) * 0.035);
  if (frame === 'paper') return { top: u, right: u, bottom: u, left: u };
  if (frame === 'polaroid') return { top: u, right: u, bottom: u * 3.4 | 0, left: u };
  return { top: 0, right: 0, bottom: 0, left: 0 };
}
