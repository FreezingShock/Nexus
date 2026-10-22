// The sky: one large dome that follows the camera, so a sky shows wherever the town does not reach (the edge of the land
// in the classic view, and any way the free camera looks). Its gradient, sun or moon, stars and drifting clouds are all
// in one shader, so it is one draw call and no geometry. The colours come from render/sky-look.js, worked out from the
// eased sky every frame: the day cycle, weather and season are the same targets the lights and the season shader use.
// Clouds are painted on the dome, not built: they drift slowly, cel-shaded with a thin ink edge. Low graphics (effects
// light) draws two octaves of cloud instead of four, and effects off draws no clouds. Stars and the sun or moon stay.
import * as THREE from '../../../vendor/three/three.module.min.js';
import { skyPalette, makePalette } from '../sky-look.js';

const RADIUS = 500;      // the dome's distance from the camera; the far plane is 900
const DRIFT = 0.006;     // cloud drift per second, in cloud-space units

// The vertex shader puts the sphere around whichever camera draws it (the classic view, free-fly, or the postcard's
// copy), and gives every point the far depth so the sky sits behind the town and loses every depth test to it.
const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = vec4(position * ${RADIUS.toFixed(1)} + cameraPosition, 1.0);
  gl_Position = projectionMatrix * viewMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const FRAG = `
uniform vec3 uZenith, uHorizon, uCloudLit, uCloudShade, uInk, uBodyCol, uBodyDir;
uniform float uBodyAmt, uBodyGlow, uStars, uCover, uFlat, uTime, uDrift, uOct, uClouds;
varying vec3 vDir;

float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, n = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uOct) break;
    s += a * vnoise(p); n += a;
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / n;
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;

  // Gradient: the haze at the horizon, the sky's colour overhead, and flat haze under fog.
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, up));
  col = mix(col, uHorizon, uFlat * 0.9 * (1.0 - smoothstep(0.0, 0.45, up)));

  // The sun or moon: a small disc with a soft halo round it.
  float sd = max(dot(d, uBodyDir), 0.0);
  col += uBodyCol * (pow(sd, 40.0) * 0.45 + pow(sd, 6.0) * 0.12) * uBodyGlow * uBodyAmt;
  col = mix(col, uBodyCol, smoothstep(0.9979, 0.9984, sd) * uBodyAmt);

  // Stars: a grid on the sphere, a few cells in forty lit, each twinkling at its own rate.
  if (uStars > 0.0 && up > 0.0) {
    vec3 g = d * 58.0;
    vec3 cell = floor(g);
    vec3 f = fract(g) - 0.5;
    float h = h3(cell);
    float star = step(0.975, h) * (1.0 - smoothstep(0.08, 0.2, length(f)));
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + 2.0 * h) + h * 60.0);
    col += vec3(0.95, 0.96, 1.0) * star * tw * uStars * smoothstep(0.0, 0.2, up);
  }

  // Clouds: fbm noise on a plane seen from below. The side facing the sun is lit; the side under more cloud is shaded.
  if (uClouds > 0.0 && uCover > 0.0 && up > 0.005) {
    vec2 q = d.xz / (up + 0.15) * 1.4 + vec2(uDrift, uDrift * 0.4);
    float c = fbm(q);
    float th = mix(0.68, 0.46, uCover);
    vec2 toSun = normalize(uBodyDir.xz + vec2(1e-4));
    float ahead = fbm(q + toSun * 0.12);
    float shade = smoothstep(-0.015, 0.03, ahead - c);
    float body = smoothstep(th, th + 0.015, c);
    float ink = (1.0 - smoothstep(0.0, 0.012, abs(c - th))) * 0.45;
    float fade = smoothstep(0.005, 0.22, up);
    vec3 cc = mix(uCloudLit, uCloudShade, shade * 0.9);
    col = mix(col, cc, body * fade);
    col = mix(col, uInk, ink * fade);
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  id: 'sky',
  order: -100,
  create({ scene }) {
    const palette = makePalette();
    const uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uInk: { value: new THREE.Color() },
      uBodyCol: { value: new THREE.Color() }, uBodyDir: { value: new THREE.Vector3(0, 1, 0) },
      uBodyAmt: { value: 1 }, uBodyGlow: { value: 1 }, uStars: { value: 0 }, uCover: { value: 0 }, uFlat: { value: 0 },
      uTime: { value: 0 }, uDrift: { value: 0 }, uOct: { value: 4 }, uClouds: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    mesh.frustumCulled = false;
    // Drawn after the opaque town, so the early depth test skips the sky wherever the town is in front of it.
    mesh.renderOrder = 1000;
    scene.add(mesh);

    let evening = null; // eased 0 (morning) to 1 (evening); snaps on the first frame

    return {
      frame(f) {
        const want = f.state.hour >= 12 ? 1 : 0;
        if (evening === null) evening = want;
        else evening += (want - evening) * Math.min(1, f.dt * 0.5);

        const p = skyPalette(f.sky, scene.fog.color, evening, palette);
        uniforms.uZenith.value.copy(p.zenith);
        uniforms.uHorizon.value.copy(p.horizon);
        uniforms.uCloudLit.value.copy(p.cloudLit);
        uniforms.uCloudShade.value.copy(p.cloudShade);
        uniforms.uInk.value.copy(p.ink);
        uniforms.uBodyCol.value.copy(p.bodyCol);
        uniforms.uBodyDir.value.copy(p.bodyDir);
        uniforms.uBodyAmt.value = p.bodyAmt;
        uniforms.uBodyGlow.value = p.bodyGlow;
        uniforms.uStars.value = p.stars;
        uniforms.uCover.value = p.cover;
        uniforms.uFlat.value = p.flat;
        uniforms.uTime.value = f.t;
        uniforms.uDrift.value = f.t * DRIFT;
      },
      // Graphics settings: effects 0 (Off) draws no clouds, 0.5 (Light) two octaves, 1 (Full) four.
      quality(rs) {
        uniforms.uClouds.value = rs.effects > 0 ? 1 : 0;
        uniforms.uOct.value = rs.effects >= 1 ? 4 : 2;
      },
    };
  },
};
