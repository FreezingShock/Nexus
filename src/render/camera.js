// The camera: an orthographic orbit (the classic isometric view, freely rotated and tilted) and a perspective free-fly
// camera for walking the streets. Input is wired in scene.js (pointer, wheel) and by bindKeys() (held keys, F, H).
import * as THREE from '../../vendor/three/three.module.min.js';
import {
  ISO, TOWN_LIMIT, clamp, approach, zoomStep, orbitPose, orbitMove, orbitSpin, intentOf,
  flyVelocity, flyMove, lookChange, flyStart, isoTargetFrom, lookDir,
} from './camera-math.js';

// The orbit camera sits 150 units from its target, and zoomed out or tilted low, ground reaches back behind it. A near plane
// at +1 cut that ground off in a slanted line, with the sky showing through. Orthographic depth may be negative, so the
// near plane goes well behind the camera and the land runs on under and behind it.
const NEAR = -400;

export function createCamera() {
  const iso = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, 900);
  const fly = new THREE.PerspectiveCamera(50, 1, 0.25, 900);
  // `view` is the orbit state. Other systems read its tx, tz, half and zoom. In free-fly, tx and tz follow the free camera.
  const view = {
    tx: 0, tz: 0, ttx: 0, ttz: 0,
    az: ISO.az, taz: ISO.az, elev: ISO.elev, telev: ISO.elev,
    zoom: 1, tzoom: 1, dist: 150, half: 46,
  };
  const free = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: ISO.az, pitch: 0 };
  const keys = new Set();
  let mode = 'iso', w = 1, h = 1;

  const place = () => {
    const p = orbitPose(view.tx, view.tz, view.az, view.elev, view.dist);
    iso.position.set(p.x, p.y, p.z);
    iso.lookAt(view.tx, 0, view.tz);
  };
  const placeFree = () => {
    fly.position.set(free.pos.x, free.pos.y, free.pos.z);
    const d = lookDir(free.yaw, free.pitch);
    fly.lookAt(free.pos.x + d.x, free.pos.y + d.y, free.pos.z + d.z);
  };
  const applySize = () => {
    const a = w / h;
    iso.left = -view.half * a; iso.right = view.half * a; iso.top = view.half; iso.bottom = -view.half;
    iso.zoom = view.zoom; iso.updateProjectionMatrix();
    fly.aspect = a; fly.updateProjectionMatrix();
  };

  const api = {
    get cam() { return mode === 'fly' ? fly : iso; },
    iso, fly, view, free,
    get mode() { return mode; },
    get keys() { return keys; },
    // Keeps the orbit camera placed even in free-fly, so the postcard snapshot still has the town framing.
    place,
    resize(nw, nh) { w = nw; h = nh; applySize(); },

    // Per frame. `dragging` pauses the easing toward the focus point, so a pan does not lag behind the pointer.
    step(dt, dragging) {
      const step = Math.min(dt, 0.1);
      const it = intentOf(keys);
      if (mode === 'iso') {
        const spin = orbitSpin(it, step);
        view.taz += spin.dAz;
        view.telev = clamp(view.telev + spin.dElev, ISO.elevMin, ISO.elevMax);
        const m = orbitMove(it, view.az, (2 * view.half) / view.zoom, step);
        view.ttx = clamp(view.ttx + m.dx, -TOWN_LIMIT, TOWN_LIMIT);
        view.ttz = clamp(view.ttz + m.dz, -TOWN_LIMIT, TOWN_LIMIT);
        view.az = approach(view.az, view.taz, 12, step);
        view.elev = approach(view.elev, view.telev, 10, step);
        view.zoom = approach(view.zoom, view.tzoom, 8, step);
        if (!dragging) { view.tx = approach(view.tx, view.ttx, 5, step); view.tz = approach(view.tz, view.ttz, 5, step); }
        else { view.tx = view.ttx; view.tz = view.ttz; }
        place();
        iso.zoom = view.zoom; iso.updateProjectionMatrix();
      } else {
        free.vel = flyVelocity(free.vel, it, free.yaw, free.pitch, 9, step);
        free.pos = flyMove(free.pos, free.vel, step);
        if (it.r || it.t) { // arrows look around at a steady pace, as if dragging the mouse
          const look = lookChange(free.yaw, free.pitch, it.r * 500 * step, -it.t * 500 * step);
          free.yaw = look.yaw; free.pitch = look.pitch;
        }
        view.tx = view.ttx = free.pos.x; view.tz = view.ttz = free.pos.z;
        placeFree();
        place();
      }
    },

    // Keyboard: held keys are tracked here; F and H are handled by the camera-modes UI module.
    bindKeys(target = window) {
      const isField = (e) => e.target && e.target.closest && e.target.closest('input,textarea,select');
      const down = (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || isField(e)) return;
        keys.add(e.key.toLowerCase());
      };
      const up = (e) => keys.delete(e.key.toLowerCase());
      const clear = () => keys.clear();
      target.addEventListener('keydown', down);
      target.addEventListener('keyup', up);
      target.addEventListener('blur', clear);
      return () => {
        target.removeEventListener('keydown', down);
        target.removeEventListener('keyup', up);
        target.removeEventListener('blur', clear);
      };
    },

    // Switches between the isometric view and free-fly. The view is kept where you were looking.
    toggleFly() {
      if (mode === 'iso') {
        const s = flyStart(view.tx, view.tz, view.az);
        free.pos = s.pos; free.yaw = s.yaw; free.pitch = s.pitch; free.vel = { x: 0, y: 0, z: 0 };
        mode = 'fly';
        placeFree();
      } else {
        const t = isoTargetFrom(free.pos, free.yaw, free.pitch);
        mode = 'iso';
        view.tx = view.ttx = t.x; view.tz = view.ttz = t.z;
        view.az = view.taz = free.yaw;
        view.elev = view.telev = ISO.elev;
        place();
      }
      return mode;
    },
    // H: back to the classic isometric view, centred on the town.
    home() {
      mode = 'iso';
      view.ttx = view.tx = 0; view.ttz = view.tz = 0;
      view.taz = view.az = ISO.az; view.telev = view.elev = ISO.elev;
      view.tzoom = 1;
      place();
      return mode;
    },

    // Mouse drag. In free-fly it looks around. In the orbit view, shift rotates and tilts, otherwise it pans.
    drag(dx, dy, pxHeight, shift) {
      if (mode === 'fly') {
        const look = lookChange(free.yaw, free.pitch, dx, dy);
        free.yaw = look.yaw; free.pitch = look.pitch;
        return;
      }
      if (shift) {
        view.taz -= dx * 0.008;
        view.telev = clamp(view.telev + dy * 0.004, ISO.elevMin, ISO.elevMax);
        return;
      }
      api.pan(dx, dy, pxHeight);
    },
    // Wheel. In the orbit view it zooms. In free-fly it moves forward and back.
    wheel(deltaY) {
      if (mode === 'fly') {
        const fw = lookDir(free.yaw, free.pitch), k = -deltaY * 0.04;
        free.pos = flyMove({ x: free.pos.x + fw.x * k, y: free.pos.y + fw.y * k, z: free.pos.z + fw.z * k }, { x: 0, y: 0, z: 0 }, 0);
        return;
      }
      api.zoomBy(deltaY < 0 ? 1.12 : 0.89);
    },

    pan(dx, dy, pxHeight) {
      const k = (2 * view.half / view.zoom) / pxHeight, az = view.az, se = Math.sin(view.elev);
      view.ttx = view.tx = clamp(view.tx - Math.cos(az) * dx * k - Math.sin(az) * dy * k / se, -TOWN_LIMIT, TOWN_LIMIT);
      view.ttz = view.tz = clamp(view.tz + Math.sin(az) * dx * k - Math.cos(az) * dy * k / se, -TOWN_LIMIT, TOWN_LIMIT);
    },
    zoomBy(f) { view.tzoom = zoomStep(view.tzoom, f); },
    // Steps the view a quarter turn (kept for the design kit). Held Q and E now rotate continuously.
    rotate(d) { view.taz += d * Math.PI / 2; },
    focus(x, z) { view.ttx = x; view.ttz = z; },
  };
  return api;
}
