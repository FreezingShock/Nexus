// The bottom toolbar's chevron: folds the whole bar away and brings it back. Tiles stagger in through css/toolbar.css; this
// only flips the .off class on #tools. The choice is remembered per browser (storage may be blocked, so every call is guarded).
const KEY = 'nexus.toolbar.hidden';

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const write = (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private window or blocked storage */ } };

export default {
  id: 'toolbar-fold',
  create() {
    const bar = document.getElementById('tools'), btn = document.getElementById('toolfold');
    if (!bar || !btn) return {};
    function set(hidden, save) {
      bar.classList.toggle('off', hidden);
      btn.setAttribute('aria-expanded', String(!hidden));
      const label = hidden ? 'Show the toolbar' : 'Hide the toolbar';
      btn.setAttribute('aria-label', label); btn.title = label;
      if (save) write(hidden);
    }
    btn.onclick = () => set(!bar.classList.contains('off'), true);
    // start folded, then let the bar (and each tile after it) arrive unless the player left it hidden
    set(true, false);
    const show = !read();
    if (show) requestAnimationFrame(() => requestAnimationFrame(() => set(false, false)));
    return {};
  },
};
