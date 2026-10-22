// Decorations: every piece in state.decor merged into one mesh (plus one ink outline mesh), rebuilt only when the sim hands
// over a new list. Two draw calls however many benches and fountains there are. A second pair draws the preview under the
// cursor while the Decor tool is open.
//
// API for UI modules (scene.sys('decor')): preview(items) with items [{ k, gx, gz, rot, ok }], and clearPreview().
import * as THREE from '../../../vendor/three/three.module.min.js';
import { toonUncached, hullInk } from '../materials.js';
import { mergeDecor } from '../decor-geom.js';

const TINT = { ok: new THREE.Color(0x9AD0A0), bad: new THREE.Color(0xE8806A) };

export default {
  id: 'decor',
  create({ world }) {
    const mat = toonUncached(0xffffff, { vertexColors: true });
    const body = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    const hull = new THREE.Mesh(new THREE.BufferGeometry(), hullInk);
    body.castShadow = true; body.frustumCulled = hull.frustumCulled = false; body.visible = hull.visible = false;
    world.add(body, hull);
    const pMat = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
    const ghost = new THREE.Mesh(new THREE.BufferGeometry(), pMat);
    ghost.frustumCulled = false; ghost.visible = false; ghost.renderOrder = 5;
    world.add(ghost);

    const swap = (mesh, geo) => { mesh.geometry.dispose(); mesh.geometry = geo; };

    let shown = null, previewKey = '';
    return {
      frame(f) {
        const list = f.state.decor;
        if (!list || list === shown) return;
        shown = list;
        body.visible = hull.visible = list.length > 0;
        swap(body, mergeDecor(list));
        swap(hull, mergeDecor(list, 1.12));
      },
      preview(items) {
        const key = items.map((i) => i.k + i.gx + ',' + i.gz + i.rot + (i.ok ? 'y' : 'n')).join('|');
        if (key === previewKey) return;
        previewKey = key;
        ghost.visible = items.length > 0;
        if (items.length) swap(ghost, mergeDecor(items, 1, (it) => (it.ok ? TINT.ok : TINT.bad)));
      },
      clearPreview() { previewKey = ''; ghost.visible = false; },
    };
  },
};
