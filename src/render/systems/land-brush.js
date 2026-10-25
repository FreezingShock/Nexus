// The terrain tools' brush: a soft ring on the ground under the cursor, in the colour of the tool (sage raises, clay
// lowers, sand flattens, sky smooths) and rose where the land is out of reach. Two draw calls while shown, none when hidden.
// Driven by the terrain UI module: scene.sys('land-brush').show(x, z, r, tool, ok) / .hide().
import { heightAt } from '../../world/terrain.js';

const SEG = 48;
const COLORS = { raise: 0x7FA35C, lower: 0xB8704F, flatten: 0xD9B865, smooth: 0x8FB8D6, bad: 0xD98C7A };

export default {
  id: 'land-brush',
  create({ THREE, world }) {
    const pos = new Float32Array((SEG + 1) * 3), inner = new Float32Array((SEG + 1) * 3);
    const geo = new THREE.BufferGeometry(), geo2 = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo2.setAttribute('position', new THREE.BufferAttribute(inner, 3));
    const mat = new THREE.LineBasicMaterial({ color: COLORS.raise, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
    const mat2 = new THREE.LineBasicMaterial({ color: 0x2B2620, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false });
    const ring = new THREE.Line(geo, mat), core = new THREE.Line(geo2, mat2);
    for (const l of [ring, core]) { l.frustumCulled = false; l.renderOrder = 6; l.visible = false; world.add(l); }
    let key = '';
    function trace(arr, x, z, r) {
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        arr[i * 3] = px; arr[i * 3 + 1] = Math.max(0, heightAt(px, pz)) + 0.25; arr[i * 3 + 2] = pz;
      }
    }
    return {
      show(x, z, r, tool, ok = true) {
        const k = x.toFixed(2) + ',' + z.toFixed(2) + ',' + r + tool + ok + heightAt(x, z).toFixed(2);
        ring.visible = core.visible = true;
        if (k === key) return;
        key = k;
        trace(pos, x, z, r); trace(inner, x, z, r * 0.45);
        geo.attributes.position.needsUpdate = geo2.attributes.position.needsUpdate = true;
        mat.color.setHex(ok ? COLORS[tool] || COLORS.raise : COLORS.bad);
      },
      hide() { key = ''; ring.visible = core.visible = false; },
    };
  },
};
