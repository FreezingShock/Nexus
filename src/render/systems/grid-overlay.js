// The shared grid overlay: pencil-on-graph-paper lines over buildable ground, plus colored tile fills any tool can paint.
// Roads and zoning both use it: scene.sys('grid-overlay').show(true) while a grid tool is active.
//   show(on)                       fade the lines in or out
//   paint(layer, tiles, opts)      tiles: [[gx, gz, hexColor?], ...]; opts: { color, opacity, outline }; [] clears the layer
import { createGrid, BASE, GRID_N, GRID_HALF, TILE } from '../../world/grid.js';
import { groundY } from '../road-mesh.js';

const CAP = 1600; // tiles per paint layer

export default {
  id: 'grid-overlay',
  create({ THREE, world, layout }) {
    const group = new THREE.Group(); world.add(group);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2B2620, transparent: true, opacity: 0, depthWrite: false });
    let lines = null, want = 0, amount = 0;

    function buildLines() {
      const grid = createGrid(layout), pos = [], seen = new Set();
      const usable = (gx, gz) => gx >= 0 && gz >= 0 && gx < GRID_N && gz < GRID_N && (grid.baseAt(gx, gz) === BASE.LAND || grid.baseAt(gx, gz) === BASE.TOWN);
      const h = (gx, gz) => { const k = 'h' + gx + ',' + gz; if (seen.has(k)) return; seen.add(k); const x = (gx - GRID_HALF - 0.5) * TILE, z = (gz - GRID_HALF - 0.5) * TILE; pos.push(x, 0.16 + groundY(x, z), z, x + TILE, 0.16 + groundY(x + TILE, z), z); };
      const v = (gx, gz) => { const k = 'v' + gx + ',' + gz; if (seen.has(k)) return; seen.add(k); const x = (gx - GRID_HALF - 0.5) * TILE, z = (gz - GRID_HALF - 0.5) * TILE; pos.push(x, 0.16 + groundY(x, z), z, x, 0.16 + groundY(x, z + TILE), z + TILE); };
      for (let gz = 0; gz < GRID_N; gz++) for (let gx = 0; gx < GRID_N; gx++) {
        if (!usable(gx, gz)) continue;
        h(gx, gz); h(gx, gz + 1); v(gx, gz); v(gx + 1, gz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      lines = new THREE.LineSegments(g, lineMat);
      lines.frustumCulled = false; lines.renderOrder = 2;
      group.add(lines);
    }

    const layers = new Map();
    function layerOf(name) {
      let L = layers.get(name);
      if (L) return L;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(CAP * 12), col = new Float32Array(CAP * 12), idx = new Uint16Array(CAP * 6);
      for (let i = 0; i < CAP; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 3 + layers.size;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAP * 24), 3)); lg.setDrawRange(0, 0);
      const lmat = new THREE.LineBasicMaterial({ color: 0x2B2620, transparent: true, depthWrite: false });
      const edge = new THREE.LineSegments(lg, lmat); edge.frustumCulled = false; edge.renderOrder = 3 + layers.size; edge.visible = false;
      group.add(mesh, edge);
      L = { mesh, edge, pos, col, mat, lmat, lg, g, y: 0.2 + layers.size * 0.004 };
      layers.set(name, L);
      return L;
    }

    return {
      show(on) { want = on ? 1 : 0; if (on) { if (!lines) buildLines(); lines.visible = true; } },
      isShown: () => want === 1,
      paint(name, tiles, { color = 0x8FB8D6, opacity = 0.5, outline = false } = {}) {
        const L = layerOf(name), n = Math.min(tiles.length, CAP), c = new THREE.Color();
        L.mat.opacity = opacity;
        const hs = TILE / 2 - 0.04, el = L.lg.attributes.position.array;
        for (let i = 0; i < n; i++) {
          const [gx, gz, hex] = tiles[i], x = (gx - GRID_HALF) * TILE, z = (gz - GRID_HALF) * TILE;
          c.setHex(hex === undefined ? color : hex);
          const o = i * 12;
          L.pos.set([x - hs, L.y + groundY(x - hs, z - hs), z - hs, x + hs, L.y + groundY(x + hs, z - hs), z - hs, x + hs, L.y + groundY(x + hs, z + hs), z + hs, x - hs, L.y + groundY(x - hs, z + hs), z + hs], o);
          for (let k = 0; k < 4; k++) { L.col[o + k * 3] = c.r; L.col[o + k * 3 + 1] = c.g; L.col[o + k * 3 + 2] = c.b; }
          const e = i * 24, y = L.y + 0.002, X0 = x - hs, X1 = x + hs, Z0 = z - hs, Z1 = z + hs;
          const a = y + groundY(X0, Z0), b = y + groundY(X1, Z0), c2 = y + groundY(X1, Z1), d = y + groundY(X0, Z1);
          el.set([X0, a, Z0, X1, b, Z0, X1, b, Z0, X1, c2, Z1, X1, c2, Z1, X0, d, Z1, X0, d, Z1, X0, a, Z0], e);
        }
        L.g.attributes.position.needsUpdate = true; L.g.attributes.color.needsUpdate = true;
        L.g.setDrawRange(0, n * 6);
        L.lg.attributes.position.needsUpdate = true; L.lg.setDrawRange(0, outline ? n * 8 : 0);
        L.edge.visible = outline && n > 0; L.lmat.opacity = Math.min(1, opacity + 0.35);
      },
      frame(f) {
        amount += (want - amount) * Math.min(1, f.dt * 9);
        if (Math.abs(want - amount) < 0.01) amount = want;
        lineMat.opacity = amount * (0.2 + 0.04 * Math.sin(f.t * 2));
        if (lines && amount === 0 && want === 0) lines.visible = false;
      },
    };
  },
};
