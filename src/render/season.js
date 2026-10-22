// Season and weather in the toon shader. Every toon material gets the same small patch, so the whole town changes at
// once without rebuilding a single mesh. What a material takes is set by its patch options, not guessed from its colour:
//   leaf      leaf surfaces (land, broadleaf canopies, conifers): take the season's foliage colour. Autumn splits some
//             leaves to red by a per-colour hash, so a town is not one orange. `foliage` scales the strength (conifers 0).
//   blossom   broadleaf canopies also take the spring blossom colour.
//   field     farmland: takes the season's crop colour.
//   still     water: takes the river colour, and keeps its colour (no snow, no wet darkening).
// Every material also takes snow on its top-facing surfaces (roofs, lawns, roads) and darkens a little when wet.
// The uniforms are shared objects, so applySeason() reaches every material. Variants differ only in constants baked
// into the program, and each variant has its own cache key.
import * as THREE from '../../vendor/three/three.module.min.js';

export const SEASON = {
  snow: { value: 0 },
  wet: { value: 0 },
  foliage: { value: 0 },
  autumn: { value: 0 },
  foliageCol: { value: new THREE.Color(0xC6E27A) },
  foliageAlt: { value: new THREE.Color(0xC6E27A) },
  blossom: { value: 0 },
  blossomCol: { value: new THREE.Color(0xF4B9CB) },
  fieldCol: { value: new THREE.Color(0x9FC563) },
  waterCol: { value: new THREE.Color(0x6FA9B8) },
  snowCol: { value: new THREE.Color(0xF3F6FA) },
};

const DECL = `uniform float uSnow, uWet, uFoliage, uAutumn, uBlossom;
uniform vec3 uFoliageCol, uFoliageAlt, uBlossomCol, uFieldCol, uWaterCol, uSnowCol;`;

function body({ leaf = false, foliage = 1, blossom = false, field = false, still = false }) {
  let s = `
  vec3 seasonN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float calm = ${still ? '0.0' : '1.0'};`;
  if (leaf) s += `
  float hue = fract(sin(dot(diffuseColor.rgb, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 leafCol = mix(uFoliageCol, uFoliageAlt, smoothstep(0.55, 0.75, hue) * uAutumn);
  float leafAmt = uFoliage * ${foliage.toFixed(3)} * (0.4 + 0.6 * abs(seasonN.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, clamp(leafCol * (0.8 + 0.4 * lum), 0.0, 1.0), leafAmt);`;
  if (blossom) s += `
  diffuseColor.rgb = mix(diffuseColor.rgb, uBlossomCol, uBlossom * (0.4 + 0.6 * abs(seasonN.y)));`;
  if (field) s += `
  diffuseColor.rgb = clamp(uFieldCol * (0.85 + 0.3 * lum), 0.0, 1.0);`;
  if (still) s += `
  diffuseColor.rgb = mix(diffuseColor.rgb, uWaterCol, 0.9);`;
  s += `
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol, smoothstep(0.55, 0.8, seasonN.y) * uSnow * calm);
  diffuseColor.rgb *= 1.0 - 0.18 * uWet * calm * (0.4 + 0.6 * seasonN.y);`;
  return s;
}

// Patches a MeshToonMaterial in place. See the file header for the options.
export function patchSeason(mat, opts = {}) {
  const o = { leaf: false, foliage: 1, blossom: false, field: false, still: false, ...opts };
  mat.customProgramCacheKey = () => ['nexus-season', o.leaf, o.foliage, o.blossom, o.field, o.still].join(':');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = SEASON.snow;
    shader.uniforms.uWet = SEASON.wet;
    shader.uniforms.uFoliage = SEASON.foliage;
    shader.uniforms.uAutumn = SEASON.autumn;
    shader.uniforms.uFoliageCol = SEASON.foliageCol;
    shader.uniforms.uFoliageAlt = SEASON.foliageAlt;
    shader.uniforms.uBlossom = SEASON.blossom;
    shader.uniforms.uBlossomCol = SEASON.blossomCol;
    shader.uniforms.uFieldCol = SEASON.fieldCol;
    shader.uniforms.uWaterCol = SEASON.waterCol;
    shader.uniforms.uSnowCol = SEASON.snowCol;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + body(o));
  };
  return mat;
}

// Copies the eased sky (render/sky.js) into the shared uniforms. Called once per frame.
export function applySeason(cur) {
  SEASON.snow.value = cur.cover;
  SEASON.wet.value = cur.wet;
  SEASON.foliage.value = cur.foliage;
  SEASON.autumn.value = cur.autumn;
  SEASON.foliageCol.value.copy(cur.foliageCol);
  SEASON.foliageAlt.value.copy(cur.foliageAlt);
  SEASON.blossom.value = cur.blossom;
  SEASON.fieldCol.value.copy(cur.fieldCol);
  SEASON.waterCol.value.copy(cur.waterCol);
}
