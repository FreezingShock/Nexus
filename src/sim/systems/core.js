// Game-speed, pause and day/night. Small settings the HUD buttons send.
const SPEEDS = [1, 2, 3];

export default {
  id: 'core',
  commands: {
    setNight({ state, emit }, { on }) { state.night = on ? 1 : 0; emit({ type: 'toast', text: state.night ? 'Night falls over the town' : 'Good morning' }); },
    cycleSpeed({ state }) { state.speed = SPEEDS[state.speed % SPEEDS.length]; },
    togglePause({ state }) { state.paused = !state.paused; },
  },
};
