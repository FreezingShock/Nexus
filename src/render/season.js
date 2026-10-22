// Season and weather in the toon shader. Every toon material gets the same small patch, so the whole town changes
// at once without rebuilding a single mesh:
//   - green surfaces (grass, trees, hedges) take the season's foliage colour (autumn gold, winter dormant)
//   - broadleaf canopies also take a blossom colour in spring (only the materials that ask for it)
//   - top-facing surfaces take snow (roofs, lawns, roads) as the cover eases in
//   - wet ground darkens a little during and after rain
// The uniforms are shared objects, so one update in applySeason() reaches every material. Variants differ only in
// constants baked into the program (foliage strength, blossom on or off), and each variant has its own cache key.
import * as THREE from '../../vendor/three/three.module.min.js';

export const SEASON = {
  snow: { value: 0 },
  foliage: { value: 0 },
  foliageCol: { value: new THREE.Color(0x9DB874) },
  blossom: { value: 0 },
  blossomCol: { value: new THREE.Color(0xF4B9CB) },
  snowCol: { value: new THREE.Color(0xF3F6FA) },
  wet: { value: 0 },
};

const DECL = `uniform float uSnow, uFoliage, uBlossom, uWet;
uniform vec3 uFoliageCol, uBlossomCol, uSnowCol;`;

function body(foliage, blossom, still) {
  return `
  vec3 seasonN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float grn = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float leaf = grn * (0.4 + 0.6 * abs(seasonN.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoliageCol * (0.7 + lum), leaf * uFoliage * ${foliage.toFixed(3)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uBlossomCol, leaf * uBlossom * ${blossom ? '1.0' : '0.0'});
  float calm = ${still ? '0.0' : '1.0'};
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol, smoothstep(0.55, 0.8, seasonN.y) * uSnow * calm);
  diffuseColor.rgb *= 1.0 - 0.18 * uWet * calm * (0.4 + 0.6 * seasonN.y);`;
}

// Patches a MeshToonMaterial in place. foliage: how much of the season's colour green surfaces take (0 to 1).
// blossom: whether this material takes the spring blossom colour too. still: water, which keeps its colour all year.
export function patchSeason(mat, { foliage = 1, blossom = false, still = false } = {}) {
  mat.customProgramCacheKey = () => 'nexus-season:' + foliage + ':' + (blossom ? 1 : 0) + ':' + (still ? 1 : 0);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = SEASON.snow;
    shader.uniforms.uFoliage = SEASON.foliage;
    shader.uniforms.uFoliageCol = SEASON.foliageCol;
    shader.uniforms.uBlossom = SEASON.blossom;
    shader.uniforms.uBlossomCol = SEASON.blossomCol;
    shader.uniforms.uSnowCol = SEASON.snowCol;
    shader.uniforms.uWet = SEASON.wet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + body(foliage, blossom, still));
  };
  return mat;
}

// Copies the eased sky (render/sky.js) into the shared uniforms. Called once per frame.
export function applySeason(cur) {
  SEASON.snow.value = cur.cover;
  SEASON.foliage.value = cur.foliage;
  SEASON.foliageCol.value.copy(cur.foliageCol);
  SEASON.blossom.value = cur.blossom;
  SEASON.wet.value = cur.wet;
}
