// Keyboard for the camera. W A S D move, Q and E turn, Space rises and Shift drops in free fly, F switches modes.
// Keys are held state, not single presses, so movement is smooth; the camera itself eases the motion (src/render/camera.js).
const HELD = { w: 'f', s: 'b', a: 'l', d: 'r', ' ': 'up', shift: 'down', q: 'tl', e: 'tr' };

export default {
  id: 'camera',
  create({ scene, toast }) {
    const cam = scene.camera;
    const held = { f: false, b: false, l: false, r: false, up: false, down: false, tl: false, tr: false };
    const typing = (e) => e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');

    function toggleMode() {
      const fly = cam.mode() !== 'fly';
      cam.setMode(fly ? 'fly' : 'overview');
      toast(fly ? 'Free fly: WASD to walk, drag to look, Space and Shift to rise and drop' : 'Overview');
    }

    addEventListener('keydown', (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { if (!e.repeat) toggleMode(); return; }
      const name = HELD[k];
      if (!name) return;
      if (name === 'up') e.preventDefault(); // Space must not press the focused button
      held[name] = true; cam.setKeys(held);
    });
    addEventListener('keyup', (e) => {
      const name = HELD[e.key.toLowerCase()];
      if (!name) return;
      held[name] = false; cam.setKeys(held);
    });
    // Keys can get stuck when the window loses focus mid-press.
    addEventListener('blur', () => {
      for (const name of Object.keys(held)) held[name] = false;
      cam.setKeys(held);
    });
    return {};
  },
};
