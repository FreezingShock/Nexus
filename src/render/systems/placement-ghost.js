// The see-through preview of the buildings the player is placing: one building per lot, and every lot's tiles tinted
// green or rose. A dragged row shows up to MAX_BUILDINGS buildings (each is a few draw calls); the rest of the row
// shows as tiles only.
// Driven by the placement UI module: scene.sys('placement-ghost').showMany([{ rec, blocked, level }]) / .show(rec, blocked) / .hide().
import { describe } from '../../world/models.js';
import { tileCenter, TILE } from '../../world/grid.js';
import { heightAt } from '../../world/terrain.js';
import { makeParts, addToBatch } from '../buildings.js';
import { Batch } from '../geom.js';

const MAX_BUILDINGS = 8;

export default {
  id: 'placement-ghost',
  create({ THREE, world }) {
    const root = new THREE.Group(); root.visible = false; world.add(root);
    const tiles = new THREE.Group(); root.add(tiles);
    const tileGeo = new THREE.PlaneGeometry(TILE - 0.12, TILE - 0.12).rotateX(-Math.PI / 2);
    const ok = new THREE.MeshBasicMaterial({ color: 0xA8C179, transparent: true, opacity: 0.55, depthWrite: false });
    const bad = new THREE.MeshBasicMaterial({ color: 0xD98C7A, transparent: true, opacity: 0.6, depthWrite: false });
    const slots = []; // one per building shown: { group, made, key, base }

    function slotAt(i) {
      let s = slots[i];
      if (!s) { const group = new THREE.Group(); root.add(group); s = slots[i] = { group, made: [], key: '', base: 0 }; }
      return s;
    }
    function clearSlot(s) {
      for (const m of s.made) { s.group.remove(m); m.geometry.dispose(); if (m.userData.own) m.material.dispose(); }
      s.made = []; s.key = '';
    }
    function paintBuilding(s, d, key, valid) {
      if (key !== s.key) {
        clearSlot(s); s.key = key;
        const batch = new Batch();
        addToBatch(batch, makeParts(d), new THREE.Matrix4(), false);
        s.made = batch.build(s.group);
        for (const m of s.made) {
          if (!m.isMesh) continue;
          m.material = m.material.clone(); m.userData.own = true;
          m.material.transparent = true; m.material.opacity = 0.8; m.castShadow = m.receiveShadow = false;
        }
      }
      for (const m of s.made) if (m.isMesh) m.material.color.setHex(valid ? 0xffffff : 0xE9B8AA);
      s.group.position.set(d.x, d.y, d.z); s.group.rotation.y = d.rotY; s.base = d.y;
      s.group.visible = true;
    }
    function tileAt(i) {
      while (tiles.children.length <= i) tiles.add(new THREE.Mesh(tileGeo, ok));
      const m = tiles.children[i]; m.visible = true;
      return m;
    }

    return {
      // items: [{ rec: { id, model, gx, gz, fw, fd, rot }, blocked: [[gx, gz], ...], level }]
      showMany(items) {
        let n = 0, t = 0;
        for (const { rec, blocked = [], level = 1 } of items) {
          const d = describe(rec, level);
          if (!d) continue;
          const valid = blocked.length === 0;
          if (n < MAX_BUILDINGS) paintBuilding(slotAt(n++), d, [rec.id, rec.model, rec.fw, rec.fd, rec.rot, level].join(), valid);
          // one quad per tile, so blocked tiles show exactly where the problem is
          const bad2 = new Set(blocked.map((b) => b[0] + ',' + b[1]));
          for (let gz = rec.gz; gz < rec.gz + d.fd; gz++) for (let gx = rec.gx; gx < rec.gx + d.fw; gx++) {
            const [cx, cz] = tileCenter(gx, gz), m = tileAt(t++);
            m.material = bad2.has(gx + ',' + gz) ? bad : ok;
            m.position.set(cx, Math.max(0.05, heightAt(cx, cz)) + 0.06, cz);
          }
        }
        for (let i = n; i < slots.length; i++) slots[i].group.visible = false;
        for (let i = t; i < tiles.children.length; i++) tiles.children[i].visible = false;
        root.visible = true;
      },
      show(rec, blocked = [], level = 1) { this.showMany([{ rec, blocked, level }]); },
      hide() { root.visible = false; },
      // the gentle bob, kept off the stored base height so it never drifts
      frame(f) {
        if (!root.visible) return;
        const bob = Math.sin(f.t * 4) * 0.0015;
        for (const s of slots) if (s.group.visible) s.group.position.y = s.base + bob;
      },
    };
  },
};
