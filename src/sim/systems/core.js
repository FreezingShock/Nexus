// Game speed and pause. Small settings the HUD buttons send. Day and night follow the clock (systems/calendar.js).
const SPEEDS = [1, 2, 3];

export default {
  id: 'core',
  commands: {
    cycleSpeed({ state }) { state.speed = SPEEDS[state.speed % SPEEDS.length]; },
    togglePause({ state }) { state.paused = !state.paused; },
  },
};
