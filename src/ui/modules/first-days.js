// First days for a brand-new town: a skippable welcome postcard once (a notebook page, never over the HUD), then a soft
// glow on the toolbar tool that suggests the next thing to try. The glow moves on when the step is done or the tool is
// picked up, and "No hints, thanks" turns it all off. Towns already being played get neither. Reads the town and sends
// nothing. Rules and words are pure in src/ui/first-days.js.
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { $ } from '../format.js';
import { HINTS, advance, isVeteran, loadFirst, markSeen, nextPulse, saveFirst, stepsDoneIn } from '../first-days.js';

const WELCOME_AFTER_S = 2.5, PULSE_AFTER_S = 8, CHECK_S = 1;

export default {
  id: 'first-days',
  create({ sim }) {
    const storage = (() => { try { return localStorage; } catch { return null; } })();
    const s = sim.state;
    const first = !storage || storage.getItem('nexus.firstdays.v1') === null;
    let data = storage ? loadFirst(storage) : { welcomed: true, hidden: true, done: [], seen: [] };
    const save = () => { if (storage) saveFirst(storage, data); };
    const now = () => stepsDoneIn(s, sim.grid);

    // A town that is already being played skips the welcome and the glow.
    if (first) {
      const done = now();
      if (isVeteran(done)) data = { ...advance(data, done).data, welcomed: true, hidden: true };
      save();
    }
    let waited = 0, acc = CHECK_S, welcomePending = !data.welcomed && !data.hidden, lit = null, litFrom = 0;

    book.register('firstdays', {
      title: 'Welcome, mayor', c: '#A8C179', icon: PAGE_ICONS.goals,
      sub: () => 'A small village is waiting. Three little hints, and then it is yours.',
      render: () => `<ol class="fd-hints">${HINTS.map((h, i) => `<li class="fd-hint" style="--i:${i}"><span class="fd-n" aria-hidden="true">${i + 1}</span><span class="fd-text"><b class="h-disp">${h.head}</b><small>${h.text}</small></span></li>`).join('')}</ol>
        <p class="nb-promise">Nothing here is timed, and nothing is lost if you skip it.</p>
        <div class="fd-foot"><button class="btn primary" type="button" data-act="go">Let's go</button>
          <button class="linkbtn" type="button" data-act="hide">No hints, thanks</button></div>`,
      click(e) {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'hide') { data = { ...data, hidden: true }; save(); light(null); }
        book.close();
      },
    });

    function light(tool) {
      if (lit === tool) return;
      if (lit) { const old = document.querySelector('.tool[data-tool="' + lit + '"]'); if (old) old.classList.remove('hint-glow'); }
      lit = tool;
      if (tool) { const el = document.querySelector('.tool[data-tool="' + tool + '"]'); if (el) el.classList.add('hint-glow'); }
    }

    return {
      onTool(t) {
        if (!t || data.hidden) return;
        const next = markSeen(data, t);
        if (next !== data) { data = next; save(); light(null); litFrom = 0; }
      },
      frame(dt) {
        if (welcomePending) {
          waited += dt;
          // Wait for a quiet screen: no other page, no postcard.
          if (waited >= WELCOME_AFTER_S && !book.isOpen() && $('offline').hidden) {
            welcomePending = false;
            data = { ...data, welcomed: true }; save();
            book.open('firstdays');
          }
        }
        acc += dt;
        if (acc < CHECK_S) return;
        acc = 0;
        if (data.hidden || welcomePending || book.isOpen()) return;
        const { data: next, fresh } = advance(data, now());
        if (fresh.length) { data = next; save(); light(null); litFrom = 0; }
        const want = nextPulse(data);
        if (want === null) { light(null); return; }
        litFrom += CHECK_S;
        if (litFrom >= PULSE_AFTER_S) light(want);
      },
    };
  },
};
