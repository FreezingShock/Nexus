// Frame and draw-call readout, on when Settings > Graphics asks for it. Reads the frame time and the renderer's counters;
// changes nothing. It is a small tool for checking the budgets on a real screen, so it stays off by default.
const SAMPLE_S = 0.5;

const kilo = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));

export default {
  id: 'frame-stats',
  create({ scene, quality }) {
    let box = null, acc = 0, frames = 0;
    return {
      frame(dt) {
        if (!quality || !quality.get().stats) {
          if (box) box.hidden = true;
          acc = 0; frames = 0;
          return;
        }
        if (!box) {
          box = document.createElement('div');
          box.className = 'gfx-stats';
          box.setAttribute('aria-hidden', 'true');
          document.body.appendChild(box);
        }
        acc += dt; frames++;
        if (acc < SAMPLE_S) return;
        const fps = Math.round(frames / acc), st = scene.stats();
        box.textContent = `${fps} fps · ${st.calls} draws · ${kilo(st.triangles)} tris`;
        box.hidden = false;
        acc = 0; frames = 0;
      },
    };
  },
};
