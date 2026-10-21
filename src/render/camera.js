// Two camera modes share one view state. `cam` is the camera the renderer draws with, whichever mode is on.
// Overview is the orthographic isometric view: WASD pans, Q and E (or right-drag) turn freely, scroll zooms.
// Free fly is a perspective camera you walk through the town: WASD moves, Space rises, Shift drops, drag looks,
// scroll moves forward and back. Input is wired in scene.js (pointer, wheel) and src/ui/modules/camera.js (keys).
import * as THREE from '../../vendor/three/three.module.min.js';

export const SPEEDS = { slow: 0.5, normal: 1, fast: 2 };
const PREFS_KEY = 'nexus.camera';
const LIMIT = 70;               // overview target stays over the island
const PAN_PER_SEC = 0.35;       // overview pan, as a share of the visible height per second
const TURN_PER_SEC = 1.7;       // radians per second while Q or E is held
const RIGHT_DRAG_TURN = 0.008;  // radians per pixel of right-drag in overview
const FLY_PER_SEC = 14;         // world units per second in free fly
const FLY_EYE = 9, FLY_MIN_Y = 1.2, FLY_MAX_Y = 40, FLY_LIMIT = 80;
const FLY_LOOK = 0.0045;        // radians per pixel of drag while looking
const FLY_PITCH = [-1.4, 1.2];
const FOCUS_DIST = 14;          // how far ahead of the fly camera the overview target sits
const START_PITCH = -0.35;

const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
const clampRange = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (v, target, k, dt) => v + (target - v) * Math.min(1, dt * k);

// Unit ground vector for the held keys, relative to the heading `yaw`. Same convention as place():
// a camera turned to yaw sits at +(sin, cos) from its target and looks along -(sin, cos).
export function moveVector(keys, yaw) {
  const f = (keys.f ? 1 : 0) - (keys.b ? 1 : 0);
  const r = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  let x = -Math.sin(yaw) * f + Math.cos(yaw) * r;
  let z = -Math.cos(yaw) * f - Math.sin(yaw) * r;
  const len = Math.hypot(x, z);
  if (len > 0) { x /= len; z /= len; }
  return { x, z };
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { mode: p.mode === 'fly' ? 'fly' : 'overview', speed: Object.hasOwn(SPEEDS, p.speed) ? p.speed : 'normal' };
  } catch { return { mode: 'overview', speed: 'normal' }; } // no storage (private window, blocked): defaults
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
  catch { /* the choice still works this visit; it just won't be remembered */ }
}

export function createCamera() {
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
  const persp = new THREE.PerspectiveCamera(50, 1, 0.2, 400);
  const view = { tx: 0, tz: 0, az: Math.PI / 4, taz: Math.PI / 4, zoom: 1, tzoom: 1, elev: 0.62, dist: 150, half: 46, ttx: 0, ttz: 0 };
  const fly = { x: Math.sin(view.az) * FOCUS_DIST, y: FLY_EYE, z: Math.cos(view.az) * FOCUS_DIST, yaw: view.az, pitch: START_PITCH };
  const prefs = loadPrefs();
  const keys = { f: false, b: false, l: false, r: false, up: false, down: false, tl: false, tr: false };
  let mode = prefs.mode, speed = prefs.speed;
  let vx = 0, vz = 0, vy = 0; // eased velocities: overview pan on the ground, fly move in the air

  const place = () => {
    if (mode === 'fly') {
      const cp = Math.cos(fly.pitch);
      persp.position.set(fly.x, fly.y, fly.z);
      persp.lookAt(fly.x - Math.sin(fly.yaw) * cp, fly.y + Math.sin(fly.pitch), fly.z - Math.cos(fly.yaw) * cp);
      return;
    }
    const ce = Math.cos(view.elev), se = Math.sin(view.elev);
    ortho.position.set(view.tx + Math.sin(view.az) * ce * view.dist, se * view.dist, view.tz + Math.cos(view.az) * ce * view.dist);
    ortho.lookAt(view.tx, 0, view.tz);
  };

  // Overview pans and zooms, so the fly camera maps its point of view onto the ground ahead of it, and back.
  function setMode(next) {
    if (next === mode || (next !== 'fly' && next !== 'overview')) return;
    if (next === 'fly') {
      fly.yaw = view.taz; fly.pitch = START_PITCH; fly.y = FLY_EYE;
      fly.x = view.tx + Math.sin(fly.yaw) * FOCUS_DIST; fly.z = view.tz + Math.cos(fly.yaw) * FOCUS_DIST;
      view.az = fly.yaw;
    } else {
      const tx = clamp(fly.x - Math.sin(fly.yaw) * FOCUS_DIST, LIMIT), tz = clamp(fly.z - Math.cos(fly.yaw) * FOCUS_DIST, LIMIT);
      view.tx = view.ttx = tx; view.tz = view.ttz = tz;
      view.az = view.taz = fly.yaw;
    }
    vx = vz = vy = 0;
    mode = next;
    savePrefs({ mode, speed });
    place();
  }

  function look(dx, dy) {
    fly.yaw -= dx * FLY_LOOK;
    fly.pitch = clampRange(fly.pitch - dy * FLY_LOOK, FLY_PITCH[0], FLY_PITCH[1]);
  }

  function pan(dx, dy, pxHeight) {
    const k = (2 * view.half / view.zoom) / pxHeight, az = view.az, se = Math.sin(view.elev);
    view.ttx = view.tx = clamp(view.tx - Math.cos(az) * dx * k - Math.sin(az) * dy * k / se, LIMIT);
    view.ttz = view.tz = clamp(view.tz + Math.sin(az) * dx * k - Math.cos(az) * dy * k / se, LIMIT);
  }

  return {
    view, place,
    // The camera the renderer uses. Changes with the mode, so everything reads it through this getter.
    get cam() { return mode === 'fly' ? persp : ortho; },
    mode: () => mode,
    setMode,
    speed: () => speed,
    speeds: () => Object.keys(SPEEDS),
    setSpeed(name) {
      if (!Object.hasOwn(SPEEDS, name)) return;
      speed = name; savePrefs({ mode, speed });
    },
    // Held keys from the UI module: { f, b, l, r, up, down, tl, tr }.
    setKeys(next) { Object.assign(keys, next); },
    resize(w, h) {
      const a = w / h;
      ortho.left = -view.half * a; ortho.right = view.half * a; ortho.top = view.half; ortho.bottom = -view.half;
      ortho.zoom = view.zoom; ortho.updateProjectionMatrix();
      persp.aspect = a; persp.updateProjectionMatrix();
    },
    step(dt, dragging) {
      const sp = SPEEDS[speed];
      const turn = (keys.tr ? 1 : 0) - (keys.tl ? 1 : 0);
      if (mode === 'fly') {
        fly.yaw += turn * TURN_PER_SEC * sp * dt;
        const m = moveVector(keys, fly.yaw), v = FLY_PER_SEC * sp;
        const rise = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
        vx = ease(vx, m.x * v, 12, dt); vz = ease(vz, m.z * v, 12, dt); vy = ease(vy, rise * v * 0.6, 12, dt);
        fly.x = clamp(fly.x + vx * dt, FLY_LIMIT); fly.z = clamp(fly.z + vz * dt, FLY_LIMIT);
        fly.y = clampRange(fly.y + vy * dt, FLY_MIN_Y, FLY_MAX_Y);
        view.tx = view.ttx = fly.x; view.tz = view.ttz = fly.z; // keeps the sim's culling near the walker
      } else {
        view.taz += turn * TURN_PER_SEC * sp * dt;
        view.az = ease(view.az, view.taz, 7, dt);
        const pan = (2 * view.half / view.zoom) * PAN_PER_SEC * sp;
        const m = moveVector(keys, view.az);
        vx = ease(vx, m.x * pan, 10, dt); vz = ease(vz, m.z * pan, 10, dt);
        if (vx || vz) {
          view.ttx = clamp(view.ttx + vx * dt, LIMIT); view.ttz = clamp(view.ttz + vz * dt, LIMIT);
        }
        if (!dragging) { view.tx = ease(view.tx, view.ttx, 5, dt); view.tz = ease(view.tz, view.ttz, 5, dt); }
      }
      view.zoom = ease(view.zoom, view.tzoom, 8, dt);
      place();
      ortho.zoom = view.zoom; ortho.updateProjectionMatrix();
    },
    // Pointer drag. Overview: left or middle pans, right turns. Free fly: any drag looks around.
    drag(dx, dy, pxHeight, button) {
      if (mode === 'fly') { look(dx, dy); return; }
      if (button === 2) { view.taz += dx * RIGHT_DRAG_TURN; return; }
      pan(dx, dy, pxHeight);
    },
    // Wheel. Overview zooms; free fly moves forward (scroll up) or back (scroll down).
    wheel(deltaY) {
      if (mode !== 'fly') { view.tzoom = Math.max(0.55, Math.min(3, view.tzoom * (deltaY < 0 ? 1.12 : 0.89))); return; }
      const step = -clampRange(deltaY * 0.04, -3, 3) * SPEEDS[speed];
      fly.x = clamp(fly.x - Math.sin(fly.yaw) * step, FLY_LIMIT);
      fly.z = clamp(fly.z - Math.cos(fly.yaw) * step, FLY_LIMIT);
    },
    pan,
    zoomBy(f) { view.tzoom = Math.max(0.55, Math.min(3, view.tzoom * f)); },
    // Quarter turn in one go. Kept for the kit page; the game turns freely by holding Q or E.
    rotate(d) { view.taz += d * Math.PI / 2; },
    focus(x, z) {
      if (mode === 'fly') { fly.x = clamp(x - Math.sin(fly.yaw) * FOCUS_DIST, FLY_LIMIT); fly.z = clamp(z - Math.cos(fly.yaw) * FOCUS_DIST, FLY_LIMIT); return; }
      view.ttx = x; view.ttz = z;
    },
  };
}
