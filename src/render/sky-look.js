// The sky's colours and shader inputs, worked out every frame from the eased sky (render/sky.js) and the fog colour that
// night.js sets for the horizon. Nothing here reads the sim: the sky follows the same targets the lights and the season
// shader already follow, so there is one set of rules for the look. Pure apart from THREE.Color, so node can test it.
import * as THREE from '../../vendor/three/three.module.min.js';

const col = (hex) => new THREE.Color(hex);

// Zenith (the top of the sky), by time and weather. Sky blue is an accent here, mixed with cream and rose.
const DAY_ZENITH = col(0x8DBFD6), MORN_ZENITH = col(0xB4BCDD), DUSK_ZENITH = col(0x8C6A9C);
const GREY_ZENITH = col(0x9CA8AD), SNOW_ZENITH = col(0xBCCBD6), NIGHT_ZENITH = col(0x1C2648);
// Clouds: a lit side and a shaded side, with a rose tint at dusk, grey under cloud and blue-violet at night.
const CLOUD_LIT = col(0xFFF7E8), CLOUD_SHADE = col(0xD8CBBE);
const CLOUD_DUSK_LIT = col(0xF5BBA0), CLOUD_DUSK_SHADE = col(0xB58AA2);
const CLOUD_GREY = col(0xB9C1C5), CLOUD_GREY_SHADE = col(0x959EA4), CLOUD_RAIN = col(0x8E989F);
const CLOUD_NIGHT = col(0x3F4C78), CLOUD_NIGHT_SHADE = col(0x252E55);
const INK = col(0x5B4636), INK_NIGHT = col(0x141A33);
// The body in the sky: the sun by day (warm at dawn and dusk), the moon at night.
const SUN_DAWN = col(0xFFB273), MOON = col(0xE6ECFF);

const tmp = col(0);

// Fresh output object. skyPalette fills it in place, so the frame allocates nothing.
export function makePalette() {
  return {
    zenith: col(0), horizon: col(0), cloudLit: col(0), cloudShade: col(0), ink: col(0),
    bodyCol: col(0), bodyDir: new THREE.Vector3(0, 1, 0),
    bodyAmt: 0, bodyGlow: 0, stars: 0, cover: 0, flat: 0,
  };
}

// look: the eased sky (cloud, fog, rain, snow, night, warm, daylight, dir, hazeCol, sunCol).
// horizon: the colour of the haze at the edge of the town, from the fog. evening: 0 morning, 1 evening (eased by the caller).
export function skyPalette(look, horizon, evening = 0, out = makePalette()) {
  const day = 1 - look.night;
  const dusk = look.warm * day;          // warm peaks at dawn and dusk, when the sun meets the horizon
  const cloud = look.cloud, rain = look.rain;

  const z = out.zenith.copy(DAY_ZENITH);
  tmp.copy(MORN_ZENITH).lerp(DUSK_ZENITH, evening);
  z.lerp(tmp, dusk * 0.7);
  z.lerp(GREY_ZENITH, cloud * 0.8 * day);
  z.lerp(look.hazeCol, 0.2 * day);       // the season's haze tints the top too: cream, pale blue, warm, cold
  z.lerp(SNOW_ZENITH, look.snow * 0.3 * day);
  z.lerp(horizon, look.fog * 0.6 * day);
  z.lerp(NIGHT_ZENITH, look.night);

  out.horizon.copy(horizon);

  // Cloud cover: a fair-weather sky still has puffs, and overcast fills it.
  out.cover = Math.min(1, 0.22 + 0.78 * cloud);

  const lit = out.cloudLit.copy(CLOUD_LIT).lerp(CLOUD_DUSK_LIT, dusk * 0.7);
  lit.lerp(CLOUD_GREY, cloud * 0.6 * day).lerp(CLOUD_RAIN, rain * 0.35 * day).lerp(CLOUD_NIGHT, look.night);
  const shade = out.cloudShade.copy(CLOUD_SHADE).lerp(CLOUD_DUSK_SHADE, dusk * 0.6);
  shade.lerp(CLOUD_GREY_SHADE, cloud * 0.6 * day).lerp(CLOUD_RAIN, rain * 0.35 * day).lerp(CLOUD_NIGHT_SHADE, look.night);
  out.ink.copy(INK).lerp(INK_NIGHT, look.night);

  // The body: the light's direction (the sun by day, the moon once the sun is under the roofs).
  out.bodyDir.copy(look.dir).normalize();
  out.bodyCol.copy(look.sunCol).lerp(SUN_DAWN, dusk * 0.6).lerp(MOON, look.night);
  const seen = 1 - 0.9 * out.cover;      // cloud hides the body
  out.bodyAmt = seen;
  out.bodyGlow = (0.35 + 0.4 * dusk) * day + 0.18 * look.night;
  out.stars = look.night * Math.max(0, 1 - 1.2 * out.cover); // a clear night shows them; rain and overcast hide them
  out.flat = look.fog;                   // fog flattens the sky down to the haze
  return out;
}
