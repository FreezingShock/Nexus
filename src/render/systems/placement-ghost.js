// The see-through preview of a building while the player is placing it, with the lot's tiles tinted green or rose.
// Driven by the placement UI module: scene.sys('placement-ghost').show(...) / .hide().
import { describe } from '../../world/models.js';
import { tileCenter, TILE } from '../../world/grid.js';
import { heightAt } from '../../world/terrain.js';
import { makeParts, worldMatrix, addToBatch } from '../buildings.js';
import { Batch } from '../geom.js';

export default {
  id: 'placement-ghost',
  create({ THREE, world }) {
    const root = new THREE.Group(); root.visible = false; world.add(root);
    const body = new THREE.Group(); root.add(body);
    const tiles = new THREE.Group(); root.add(tiles);
    const tileGeo = new THREE.PlaneGeometry(TILE - 0.12, TILE - 0.12).rotateX(-Math.PI / 2);
    const ok = new THREE.MeshBasicMaterial({ color: 0xA8C179, transparent: true, opacity: 0.55, depthWrite: false });
    const bad = new THREE.MeshBasicMaterial({ color: 0xD98C7A, transparent: true, opacity: 0.6, depthWrite: false });
    let made = [], key = '';

    function clear() {
      for (const m of made) { body.remove(m); m.geometry.dispose(); if (m.material.dispose && m.material !== undefined && m.userData.own) m.material.dispose(); }
      made = [];
    }

    return {
      // rec: { id, model, gx, gz, fw, fd, rot }; blocked: [[gx, gz], ...] tiles that cannot be built on
      show(rec, blocked = [], level = 1) {
        const d = describe(rec, level); if (!d) return this.hide();
        const k = [rec.id, rec.model, rec.fw, rec.fd, rec.rot, level].join();
        const valid = blocked.length === 0;
        if (k !== key) {
          key = k; clear();
          const batch = new Batch();
          addToBatch(batch, makeParts(d), new THREE.Matrix4(), false);
          made = batch.build(body);
          for (const m of made) {
            if (!m.isMesh) continue;
            m.material = m.material.clone(); m.userData.own = true;
            m.material.transparent = true; m.material.opacity = 0.8; m.castShadow = m.receiveShadow = false;
          }
        }
        for (const m of made) if (m.isMesh) m.material.color.setHex(valid ? 0xffffff : 0xE9B8AA);
        body.position.set(d.x, d.y, d.z); body.rotation.y = d.rotY;
        // one quad per tile, so blocked tiles show exactly where the problem is
        while (tiles.children.length < d.fw * d.fd) tiles.add(new THREE.Mesh(tileGeo, ok));
        const bad2 = new Set(blocked.map((t) => t[0] + ',' + t[1]));
        let i = 0;
        for (let gz = rec.gz; gz < rec.gz + d.fd; gz++) for (let gx = rec.gx; gx < rec.gx + d.fw; gx++) {
          const [cx, cz] = tileCenter(gx, gz), m = tiles.children[i++];
          m.visible = true; m.material = bad2.has(gx + ',' + gz) ? bad : ok;
          m.position.set(cx, Math.max(0.05, heightAt(cx, cz)) + 0.06, cz);
        }
        for (; i < tiles.children.length; i++) tiles.children[i].visible = false;
        root.visible = true;
      },
      hide() { root.visible = false; },
      frame(f) { if (root.visible) body.position.y += Math.sin(f.t * 4) * 0.0015; },
    };
  },
};
