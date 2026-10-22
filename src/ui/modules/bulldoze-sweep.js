// Bulldozing buildings by dragging. With the Bulldoze tool, press on a building and drag over others to clear them.
// One sweep is one undo step, so Ctrl+Z brings a whole street back. Presses on roads (the road tool erases those) and
// on empty ground keep their old behaviour: empty ground still pans the camera.
// The pointer's path is sampled each frame, so a quick drag does not skip a building between mouse events.
const SAMPLES = 6;

export default {
  id: 'bulldoze-sweep',
  create({ sim, send, scene, tool }) {
    const stage = scene.canvas.parentElement;
    let sweep = null, groupNo = 0, last = null, pending = null;

    function take(id) {
      if (!sweep || !id || sweep.seen.has(id) || !sim.alive(id)) return;
      sweep.seen.add(id);
      send({ type: 'bulldoze', id, group: sweep.group });
    }
    function onDown(e) {
      if (e.button !== 0 || tool() !== 'bulldoze') return;
      const id = scene.pickAt(e.clientX, e.clientY);
      if (!id) return; // empty ground or a road: not ours
      e.stopPropagation(); e.preventDefault();
      sweep = { group: ++groupNo, seen: new Set(), pointer: e.pointerId };
      last = { x: e.clientX, y: e.clientY }; pending = null;
      try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      take(id);
    }
    function onMove(e) {
      if (sweep && e.pointerId === sweep.pointer) pending = { x: e.clientX, y: e.clientY };
    }
    function onUp(e) {
      if (sweep && e.pointerId === sweep.pointer) { sweep = null; last = null; pending = null; }
    }
    stage.addEventListener('pointerdown', onDown, true);
    stage.addEventListener('pointermove', onMove, true);
    stage.addEventListener('pointerup', onUp, true);
    stage.addEventListener('pointercancel', onUp, true);

    return {
      frame() {
        if (!sweep || !pending || !last) return;
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          take(scene.pickAt(last.x + (pending.x - last.x) * t, last.y + (pending.y - last.y) * t));
        }
        last = pending; pending = null;
      },
    };
  },
};
