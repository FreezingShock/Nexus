// Camera shortcuts: F switches between the isometric town view and free-fly, H goes home to the classic view.
// Movement keys (WASD, arrows, Q and E, Shift) are held-key state read by the camera every frame, not handled here.
const FLY_HINT = 'Free fly: WASD to move, drag or arrows to look, Q and E for height, F to return.';

export default {
  id: 'camera-modes',
  create({ scene, toast }) {
    const camera = scene.camera;
    return {
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'f') {
          const mode = camera.toggleFly();
          toast(mode === 'fly' ? FLY_HINT : 'Back to the town view.');
          return true;
        }
        if (k === 'h') {
          camera.home();
          toast('Home: the classic town view.');
          return true;
        }
        return false;
      },
    };
  },
};
