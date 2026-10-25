// A one-way channel from the UI modules to the sound engine. A UI module calls playCue('road-grow', { n }) without
// importing the engine; the sound module sets the sink once it exists. Until then, and in tests, playCue does nothing.
let sink = null;

export function setCueSink(fn) { sink = typeof fn === 'function' ? fn : null; }
export function playCue(name, opts) { if (sink) sink(name, opts || {}); }

// The music's two small channels: the title of the tune playing (null between tunes) for Settings to show, and a way for
// Settings to ask for the next tune. The engine sets both once it starts.
let playing = null, command = null;
const listeners = new Set();
export function setNowPlaying(title) {
  playing = typeof title === 'string' ? title : null;
  listeners.forEach((fn) => fn(playing));
}
export const nowPlaying = () => playing;
export function onNowPlaying(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setMusicCommand(fn) { command = typeof fn === 'function' ? fn : null; }
export function musicCommand(cmd) { if (command) command(cmd); }
