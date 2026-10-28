// The toolbar's groups (captions and dividers live in index.html and css/toolbar.css) and its lock marks: a small lock
// chip on a tile that still has items to open with Parts, turning into a green dot when the Parts in hand can open one.
// The hover line adds the next unlock. Reads the sim; sends nothing.
import { lockHint } from '../toolbar-hints.js';

export default {
  id: 'toolbar-groups',
  create({ sim }) {
    const tiles = [...document.querySelectorAll('#tools .tool')];
    const base = new Map(tiles.map((t) => [t, t.getAttribute('title') || '']));
    const sig = new Map();
    let acc = 0;
    function paint() {
      for (const t of tiles) {
        const h = lockHint(t.dataset.tool, sim.state);
        const key = h.locked + ':' + h.ready;
        if (sig.get(t) === key) continue;
        sig.set(t, key);
        t.classList.toggle('has-lock', h.locked > 0 && !h.ready);
        t.classList.toggle('can-open', h.ready);
        const old = t.querySelector('.lockmark');
        if (old) old.remove();
        if (h.locked) {
          const m = document.createElement('i');
          m.className = 'lockmark'; m.setAttribute('aria-hidden', 'true');
          t.appendChild(m);
        }
        const b = base.get(t);
        t.title = h.tip ? (b ? b + ' ' : '') + h.tip : b;
      }
    }
    paint();
    // a once-a-second look is plenty: Parts only change on the 1 Hz tick
    return { frame(dt) { acc += dt; if (acc >= 1) { acc = 0; paint(); } } };
  },
};
