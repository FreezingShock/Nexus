// The front-of-game sequence, the parts that need no browser: the two lists of real load steps (the ones that run quietly
// behind the title screen, and the ones the progress screen shows), the progress tracker they report to, the smoothing
// of the bar, and the small texts. The DOM side is src/ui/title.js; the wiring is main.js.

// Phase A runs behind the title screen while the town draws itself. Weights are rough relative costs.
export const WARM_STEPS = [
  { id: 'fonts', caption: 'Inking the letters', weight: 1 },
  { id: 'modules', caption: 'Unrolling the map', weight: 3 },
  { id: 'save', caption: 'Unfolding your saved town', weight: 2 },
  { id: 'sim', caption: 'Waking the townsfolk', weight: 2 },
  { id: 'scene', caption: 'Painting hills, fields and rooftops', weight: 6 },
  { id: 'stores', caption: 'Tuning the settings', weight: 1 },
];

// Phase B runs after Play, under the progress screen.
export const PLAY_STEPS = [
  { id: 'away', caption: 'Counting the hours you were away', weight: 2 },
  { id: 'ui', caption: 'Sharpening the pencils', weight: 4 },
  { id: 'lamps', caption: 'Lighting the lamps', weight: 3 },
  { id: 'post', caption: 'Sorting the post', weight: 1 },
];

// A step that finishes in a blink would flash its caption past unread. The progress screen holds each step at least this long.
export const MIN_STEP_MS = 420;
export const REVEAL_HOLD_MS = 380; // the full bar rests this long before the screen opens onto the town

// The tracker: `begin(id)` names the step under way, `done(id)` finishes it. The fraction is the finished weight over the
// total, so it only ever moves forward, and an unknown or repeated id changes nothing.
export function createProgress(steps) {
  const list = steps.map((s) => ({ ...s, state: 'todo' }));
  const total = list.reduce((a, s) => a + s.weight, 0);
  const find = (id) => list.find((s) => s.id === id);
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(api));
  const api = {
    begin(id) { const s = find(id); if (s && s.state === 'todo') { s.state = 'doing'; emit(); } },
    done(id) { const s = find(id); if (s && s.state !== 'done') { s.state = 'done'; emit(); } },
    fraction() { return total ? list.filter((s) => s.state === 'done').reduce((a, s) => a + s.weight, 0) / total : 1; },
    isDone() { return list.every((s) => s.state === 'done'); },
    // The caption of the step under way, else of the next one waiting, else the last.
    caption() { return (list.find((s) => s.state === 'doing') || list.find((s) => s.state === 'todo') || list[list.length - 1] || { caption: '' }).caption; },
    steps: () => list.map((s) => ({ id: s.id, caption: s.caption, state: s.state })),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}

// The bar chases its target instead of jumping to it. Frame-rate independent; never passes the target, never goes back.
export function chase(shown, target, dt, rate = 5) {
  if (!(dt > 0)) return Math.min(shown, target);
  const next = shown + (target - shown) * (1 - Math.exp(-rate * dt));
  return Math.min(target, Math.max(shown, Math.abs(target - next) < 0.002 ? target : next));
}

// A promise that resolves no sooner than `ms` after it began, with the work's result (a rejection passes straight through).
export async function atLeast(ms, work, wait = (t) => new Promise((r) => setTimeout(r, t)), now = () => Date.now()) {
  const start = now();
  const out = await work();
  const left = ms - (now() - start);
  if (left > 0) await wait(left);
  return out;
}

// The line under the Play button.
export function saveLine(source, savedAgo) {
  if (source === 'save' || source === 'backup') return savedAgo ? 'Your town, last saved ' + savedAgo : 'Your town is waiting';
  return 'A small village is waiting for a mayor';
}

export const CREDITS = [
  { head: 'Made by', lines: ['nate (FreezingShock)'] },
  { head: 'Drawn with', lines: ['Three.js (MIT licence)', 'Fraunces and Capriola (SIL Open Font Licence)'] },
  { head: 'Promise', lines: ['Works offline. Nothing leaves your browser. No ads, no timers that punish you.'] },
];
