// Orthographic camera orbit, pan and zoom with easing. Input is wired in scene.js.
import * as THREE from '../../vendor/three/three.module.min.js';

export function createCamera() {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
  const view = { tx: 0, tz: 0, az: Math.PI / 4, taz: Math.PI / 4, zoom: 1, tzoom: 1, elev: 0.62, dist: 150, half: 46, ttx: 0, ttz: 0 };
  const place = () => {
    const ce = Math.cos(view.elev), se = Math.sin(view.elev);
    cam.position.set(view.tx + Math.sin(view.az) * ce * view.dist, se * view.dist, view.tz + Math.cos(view.az) * ce * view.dist);
    cam.lookAt(view.tx, 0, view.tz);
  };
  return {
    cam, view, place,
    resize(w, h) {
      const a = w / h;
      cam.left = -view.half * a; cam.right = view.half * a; cam.top = view.half; cam.bottom = -view.half; cam.zoom = view.zoom;
      cam.updateProjectionMatrix();
    },
    step(dt, dragging) {
      view.az += (view.taz - view.az) * Math.min(1, dt * 7);
      view.zoom += (view.tzoom - view.zoom) * Math.min(1, dt * 8);
      if (!dragging) { view.tx += (view.ttx - view.tx) * Math.min(1, dt * 5); view.tz += (view.ttz - view.tz) * Math.min(1, dt * 5); }
      place(); cam.zoom = view.zoom; cam.updateProjectionMatrix();
    },
    pan(dx, dy, pxHeight) {
      const k = (2 * view.half / view.zoom) / pxHeight, az = view.az, se = Math.sin(view.elev);
      view.ttx = view.tx = Math.max(-70, Math.min(70, view.tx - Math.cos(az) * dx * k - Math.sin(az) * dy * k / se));
      view.ttz = view.tz = Math.max(-70, Math.min(70, view.tz + Math.sin(az) * dx * k - Math.cos(az) * dy * k / se));
    },
    zoomBy(f) { view.tzoom = Math.max(0.55, Math.min(3, view.tzoom * f)); },
    rotate(d) { view.taz += d * Math.PI / 2; },
    focus(x, z) { view.ttx = x; view.ttz = z; },
  };
}
