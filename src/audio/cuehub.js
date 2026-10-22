// A one-way channel from the UI modules to the sound engine. A UI module calls playCue('road-grow', { n }) without
// importing the engine; the sound module sets the sink once it exists. Until then, and in tests, playCue does nothing.
let sink = null;

export function setCueSink(fn) { sink = typeof fn === 'function' ? fn : null; }
export function playCue(name, opts) { if (sink) sink(name, opts || {}); }
