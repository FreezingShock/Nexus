// Graphics settings: presets, the value each option may take, and the per-browser store. Pure: no DOM, no Three.js,
// so the rules are tested in node. The store keeps its own localStorage key, so Start over never clears these.
// Renderers read the mapped values from renderSettings(), never the raw option names.

export const QUALITY_KEY = 'nexus.quality.v1';
const VERSION = 1;

export const PRESET_NAMES = ['low', 'medium', 'high', 'ultra'];

// What each option may hold. Anything else in storage is ignored and the preset's value is used.
export const OPTIONS = {
  shadows: { bool: true },
  shadowSize: { values: [1024, 2048, 4096] },           // sun shadow map, pixels per side
  pixelRatio: { values: [1, 1.25, 1.5, 2] },            // cap on the canvas pixel ratio (never above the screen's)
  effects: { values: ['off', 'light', 'full'] },        // dust puffs, hearts and town life (smoke, washing, cats, residents at their doors)
  crowd: { values: ['light', 'normal', 'busy'] },       // cars and townsfolk on screen
  edges: { bool: true },                                // ink edges on vehicles
  stats: { bool: true },                                // frame and draw-call readout; not part of any preset
};

// Each preset sets every graphics option. `stats` is left alone by presets.
export const PRESETS = {
  low:    { shadows: false, shadowSize: 1024, pixelRatio: 1,    effects: 'light', crowd: 'light',  edges: false, stats: false },
  medium: { shadows: true,  shadowSize: 1024, pixelRatio: 1.25, effects: 'full',  crowd: 'normal', edges: true,  stats: false },
  high:   { shadows: true,  shadowSize: 2048, pixelRatio: 2,    effects: 'full',  crowd: 'normal', edges: true,  stats: false }, // what the town looked like before settings
  ultra:  { shadows: true,  shadowSize: 4096, pixelRatio: 2,    effects: 'full',  crowd: 'busy',   edges: true,  stats: false },
};

// Scale factors the render side applies. Crowd scales the fleet and townsfolk targets: the busiest setting must stay
// under the instance caps in cars.js (CAR_MAX 500) and townsfolk.js (MAX 500) for a 300 target: 300 x 1.5 = 450.
export const CROWD = { light: 0.5, normal: 1, busy: 1.5 };
export const EFFECTS = { off: 0, light: 0.5, full: 1 };

// A first run picks High on a mouse-and-keyboard screen and Medium on a touch screen.
export function defaultPreset(env = {}) { return env.coarse ? 'medium' : 'high'; }

export function detectEnv() {
  try { return { coarse: !!(globalThis.matchMedia && matchMedia('(pointer: coarse)').matches) }; }
  catch { return { coarse: false }; }
}

function cleanValue(key, v) {
  const spec = OPTIONS[key];
  if (!spec) return undefined;
  if (spec.bool) return typeof v === 'boolean' ? v : undefined;
  return spec.values.includes(v) ? v : undefined;
}

// Keeps the valid keys of a saved options object and fills the rest from `base`.
export function sanitizeOptions(raw, base) {
  const out = { ...base };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(OPTIONS)) {
      const v = cleanValue(k, raw[k]);
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

// Storage is optional and may throw (a private window or blocked storage): a town never waits on these settings.
function readStored(storage) {
  try { return JSON.parse((storage && storage.getItem(QUALITY_KEY)) || 'null'); }
  catch { return null; }
}

// Turns a stored record into { preset, ...options }. A named preset always uses its current table, so tuning a preset
// here reaches everyone who has it selected.
export function resolveStored(raw, env = {}) {
  const fallback = defaultPreset(env);
  const ok = !!raw && typeof raw === 'object' && raw.v === VERSION;
  const name = ok && (PRESET_NAMES.includes(raw.preset) || raw.preset === 'custom') ? raw.preset : fallback;
  const saved = ok && raw.options && typeof raw.options === 'object' ? raw.options : null;
  if (name === 'custom') return { preset: 'custom', ...sanitizeOptions(saved, PRESETS[fallback]) };
  return { preset: name, ...PRESETS[name], stats: cleanValue('stats', saved && saved.stats) === true };
}

// The store. get() returns a flat copy: { preset, shadows, shadowSize, pixelRatio, effects, crowd, edges, stats }.
export function createQualityStore({ storage = null, env = {}, onChange = () => {} } = {}) {
  let state = resolveStored(readStored(storage), env);

  function save() {
    const { preset, stats, ...graphics } = state;
    try {
      if (storage) storage.setItem(QUALITY_KEY, JSON.stringify({ v: VERSION, preset, options: { ...graphics, stats } }));
    } catch { /* not kept: the settings last this visit */ }
  }
  function commit(next) {
    state = next;
    save();
    onChange(get());
  }
  function get() { return { ...state }; }

  return {
    get,
    // Sets one option. Any graphics option makes the preset Custom; the stats readout does not.
    set(key, value) {
      const v = cleanValue(key, value);
      if (v === undefined) return false;
      const preset = key === 'stats' ? state.preset : 'custom';
      commit({ ...state, [key]: v, preset });
      return true;
    },
    // Applies a whole preset. The stats readout keeps its setting.
    choose(name) {
      if (!PRESET_NAMES.includes(name)) return false;
      commit({ preset: name, ...PRESETS[name], stats: state.stats });
      return true;
    },
  };
}

// The values the render side uses, from the flat settings. `pixelRatio` is still a cap: the scene clamps it to the
// screen's own device pixel ratio.
export function renderSettings(q) {
  return {
    shadows: !!q.shadows,
    shadowSize: q.shadowSize,
    pixelRatio: q.pixelRatio,
    effects: EFFECTS[q.effects] ?? 1,
    crowd: CROWD[q.crowd] ?? 1,
    edges: !!q.edges,
  };
}
