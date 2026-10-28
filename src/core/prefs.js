// A tiny per-browser settings store, shared by the Controls and Access pages. Pure: no DOM, so the rules are tested in
// node. A spec says what each option may hold: { values: [...] } for choices, { bool: true } for a switch, or
// { min, max, step } for a slider. Anything else in storage is ignored and the default is used, so an old or edited
// record can never break a town. Every storage call is wrapped: a town never waits on its settings.

export function cleanPref(spec, v) {
  if (!spec) return undefined;
  if (spec.bool) return typeof v === 'boolean' ? v : undefined;
  if (spec.values) return spec.values.includes(v) ? v : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const snapped = Math.round(v / spec.step) * spec.step;
  return Math.round(Math.min(spec.max, Math.max(spec.min, snapped)) * 1000) / 1000;
}

export function defaultsOf(specs) {
  const out = {};
  for (const [k, s] of Object.entries(specs)) out[k] = s.def;
  return out;
}

export function sanitizePrefs(specs, raw) {
  const out = defaultsOf(specs);
  const src = raw && typeof raw === 'object' && raw.options && typeof raw.options === 'object' ? raw.options : null;
  if (!src) return out;
  for (const k of Object.keys(specs)) {
    const v = cleanPref(specs[k], src[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function createPrefStore({ key, version = 1, specs, storage = null, onChange = () => {} }) {
  let state;
  try {
    const raw = JSON.parse((storage && storage.getItem(key)) || 'null');
    state = sanitizePrefs(specs, raw && raw.v === version ? raw : null);
  } catch { state = defaultsOf(specs); }
  const get = () => ({ ...state });
  const save = () => {
    try { storage && storage.setItem(key, JSON.stringify({ v: version, options: state })); } catch { /* the choice lasts this visit */ }
  };
  return {
    get,
    set(name, value) {
      const v = cleanPref(specs[name], value);
      if (v === undefined || v === state[name]) return false;
      state = { ...state, [name]: v };
      save();
      onChange(get());
      return true;
    },
    reset() {
      state = defaultsOf(specs);
      save();
      onChange(get());
    },
  };
}
