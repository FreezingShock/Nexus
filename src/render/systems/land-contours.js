// Contour lines over the land while the Terrain tool is in hand: a thin ink line every CONTOUR units of height (2 m) and
// a bolder one every MAJOR lines (10 m), drawn by a shader on a plane that hugs the ground (render/ground.js), so the
// shape of a hill reads at a glance while it is raised, lowered, flattened or smoothed. Fades in and out with the tool.
// One draw call while shown, none otherwise. Follows the ground as the tools move it.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { groundPlaneGeometry, refreshGroundPlane } from '../ground.js';
import { createLandWatch } from '../land-watch.js';

export const CONTOUR = 0.5, MAJOR = 5;
const LIFT = 0.19;

const VERT = `
varying float vH;
void main() {
  vH = position.y - ${LIFT.toFixed(2)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform float uShow;
uniform float uStep;
uniform float uMajor;
uniform vec3 uInk;
varying float vH;
void main() {
  if (vH < 0.02) discard; // under water and on the river banks: nothing to read
  float u = vH / uStep;
  float w = fwidth(u);
  float minor = 1.0 - smoothstep(0.0, 1.2 * w, abs(fract(u - 0.5) - 0.5));
  float m = u / uMajor;
  float wm = fwidth(m);
  float major = 1.0 - smoothstep(0.0, 2.2 * wm, abs(fract(m - 0.5) - 0.5));
  float a = max(minor * 0.38, major * 0.75) * uShow;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
}`;

export default {
  id: 'land-contours',
  create({ world }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uShow: { value: 0 }, uStep: { value: CONTOUR }, uMajor: { value: MAJOR }, uInk: { value: new THREE.Color(0x4A3F33) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      extensions: { derivatives: true },
    });
    const mesh = new THREE.Mesh(groundPlaneGeometry(LIFT), mat);
    mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.visible = false;
    world.add(mesh);
    const land = createLandWatch();
    let show = 0;
    return {
      frame(f) {
        if (land.poll()) refreshGroundPlane(mesh.geometry, LIFT);
        const want = f.tool === 'terrain' ? 1 : 0;
        if (show === want && !mesh.visible === !want) return;
        show = Math.max(0, Math.min(1, show + (want ? 1 : -1) * (f.dt || 0) * 5));
        if (!want && show < 0.01) show = 0;
        mat.uniforms.uShow.value = show;
        mesh.visible = show > 0;
      },
    };
  },
};
