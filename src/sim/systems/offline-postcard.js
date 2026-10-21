// Claiming the offline postcard. The catch-up itself lives in sim.catchUp (closed form).
export default {
  id: 'offline-postcard',
  commands: {
    collectOffline({ state, emit, syncDisplay }) {
      const o = state.offline;
      if (!o) return;
      state.coins += o.coins; state.parts += o.parts; syncDisplay();
      state.offline = null; state.log.length = 0;
      emit({ type: 'toast', text: 'Collected ' + Math.floor(o.coins).toLocaleString('en-US') + ' coins and ' + Math.floor(o.parts) + ' parts' });
    },
  },
};
