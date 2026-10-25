// The paper theme: light (cream paper, the default), dark (evening paper) or following the computer's own setting.
// Only the UI changes: the town, its sky and its night stay as they are. Pure rules plus a small per-browser store
// (like the sound and graphics settings), so Start over keeps it. Every storage call is wrapped. index.html carries a
// tiny copy of resolve() so the first frame is already the right colour; keep the two in step.

export const THEME_KEY = 'nexus.theme.v1';
const VERSION = 1;
export const MODES = ['light', 'dark', 'auto'];
export const MODE_LABEL = { light: 'Light', dark: 'Dark', auto: 'Match my computer' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const cleanMode = (m) => (MODES.includes(m) ? m : 'light');

// What the page wears for a chosen mode: auto follows the computer, the rest are what they say.
export function resolve(mode, prefersDark) {
  const m = cleanMode(mode);
  return m === 'auto' ? (prefersDark ? 'dark' : 'light') : m;
}

export function readMode(storage) {
  try {
    const raw = storage && storage.getItem(THEME_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return cleanMode(o && o.mode);
  } catch { return 'light'; }
}

// root: the element that carries data-theme (document.documentElement in the game). media: window.matchMedia or null.
export function createThemeStore({ storage = null, root = null, media = null, onChange = null } = {}) {
  let mode = readMode(storage);
  let mq = null;
  try { mq = media ? media(DARK_QUERY) : null; } catch { mq = null; }
  const prefersDark = () => !!(mq && mq.matches);
  const apply = () => {
    const look = resolve(mode, prefersDark());
    if (root) {
      root.dataset.theme = look;
      root.dataset.themeMode = mode;
    }
    return look;
  };
  const listener = () => { if (mode === 'auto') { apply(); onChange && onChange(get()); } };
  try { mq && (mq.addEventListener ? mq.addEventListener('change', listener) : mq.addListener && mq.addListener(listener)); } catch { /* old browsers just miss live changes */ }
  function get() { return { mode, look: resolve(mode, prefersDark()) }; }
  function set(m) {
    const next = cleanMode(m);
    if (next === mode) return false;
    mode = next;
    try { storage && storage.setItem(THEME_KEY, JSON.stringify({ v: VERSION, mode })); } catch { /* the choice lasts this visit */ }
    apply();
    onChange && onChange(get());
    return true;
  }
  apply();
  return { get, set, apply };
}
