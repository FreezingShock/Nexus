// The Traffic tool's flyout gets one line: commute efficiency and what the jams cost in zone income right now.
// Reads sim.traffic (the commit after each traffic cycle), never writes it.
import { $ } from '../format.js';

export default {
  id: 'commute',
  create({ sim }) {
    let el = null, shown = '';
    const line = () => {
      const m = sim.traffic;
      const pct = Math.round(m.eff * 100);
      const cost = -m.penalty;
      return cost >= 0.05
        ? `Commute ${pct}% · jams take ${cost.toFixed(1)} coins/s from zones`
        : `Commute ${pct}% · traffic flows freely`;
    };
    return {
      onTool(t) {
        el = null; shown = '';
        if (t !== 'traffic') return;
        el = document.createElement('p');
        el.className = 'commute';
        el.style.cssText = 'margin:10px 2px 0;font-size:13px;opacity:.85';
        $('fly').appendChild(el);
      },
      frame() {
        if (!el || !el.isConnected) return;
        const s = line();
        if (s !== shown) { shown = s; el.textContent = s; }
      },
    };
  },
};
