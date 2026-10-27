// "Your first days": a gentle, optional list for new players. A brand-new town opens it once, as a notebook page, a moment
// after Play; it never floats over the HUD and Esc puts it away. After that it lives in the Goals page (G) until every step
// is ticked or the player hides it. Reads the town, ticks steps by itself, cheers with a small toast, and sends nothing.
// Rules and words are pure in src/ui/first-days.js.
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { $ } from '../format.js';
import { STEPS, advance, countLine, isComplete, isVeteran, live, loadFirst, saveFirst, stepsDoneIn } from '../first-days.js';

const WELCOME_AFTER_S = 2.5, CHECK_S = 1;

export default {
  id: 'first-days',
  create({ sim, toast, setTool }) {
    const storage = (() => { try { return localStorage; } catch { return null; } })();
    const s = sim.state;
    const first = !storage || storage.getItem('nexus.firstdays.v1') === null;
    let data = storage ? loadFirst(storage) : { welcomed: true, hidden: true, done: [] };
    const save = () => { if (storage) saveFirst(storage, data); };
    live.data = data;

    // A town that is already being played skips the welcome and the list, and the steps it has done stay ticked.
    const now = () => stepsDoneIn(s, sim.grid);
    if (first) {
      const done = now();
      if (isVeteran(done)) data = { ...advance(data, done).data, welcomed: true, hidden: true };
      save();
    }
    live.data = data;
    let waited = 0, acc = CHECK_S, welcomePending = !data.welcomed && !data.hidden;

    const rows = () => STEPS.map((st, i) => {
      const ok = data.done.includes(st.id);
      const show = !ok && st.tool ? `<button class="btn fd-show" type="button" data-tool="${st.tool}">Show me <kbd>${st.key}</kbd></button>` : '';
      return `<li class="fd-step${ok ? ' fd-ok' : ''}" style="--i:${i}"><span class="fd-tick" aria-hidden="true">${ok ? '✓' : i + 1}</span>
        <span class="fd-text"><b class="h-disp">${st.head}</b><small>${ok ? st.done : st.text}</small></span>${show}</li>`;
    }).join('');

    book.register('firstdays', {
      title: 'Your first days', c: '#A8C179', icon: PAGE_ICONS.goals,
      sub: () => 'Six small things to try, in any order. Or none at all.',
      render: () => `<ol class="fd-list">${rows()}</ol>
        <p class="nb-promise">${isComplete(data) ? 'That is all of them. The town is yours now.' : countLine(data) + ' so far. Nothing here is timed, and nothing is lost if you skip it.'}</p>
        <div class="fd-foot"><button class="btn primary" type="button" data-act="go">${isComplete(data) ? 'Thank you' : 'Let me explore'}</button>
          ${isComplete(data) || data.hidden ? '' : '<button class="linkbtn" type="button" data-act="hide">Hide this list</button>'}</div>`,
      click(e) {
        const tool = e.target.closest('[data-tool]');
        if (tool) { book.close(); setTool(tool.dataset.tool); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'hide') { data = { ...data, hidden: true }; live.data = data; save(); book.close(); toast('Hidden. It stays in your Goals page if you want it back.'); }
        if (act.dataset.act === 'go') book.close();
      },
    });

    return {
      frame(dt) {
        if (welcomePending) {
          waited += dt;
          // Wait for a quiet screen: no other page, no postcard.
          if (waited >= WELCOME_AFTER_S && !book.isOpen() && $('offline').hidden) {
            welcomePending = false;
            data = { ...data, welcomed: true }; live.data = data; save();
            book.open('firstdays');
          }
        }
        acc += dt;
        if (acc < CHECK_S) return;
        acc = 0;
        if (data.hidden || isComplete(data)) return;
        const { data: next, fresh } = advance(data, now());
        if (!fresh.length) return;
        data = next; live.data = data; save();
        toast('✓ ' + fresh[0].head + '. ' + fresh[0].done);
        if (book.current() === 'firstdays') book.refresh();
        if (isComplete(data)) setTimeout(() => toast('Every first-day step done. Well played, mayor.'), 2400);
      },
    };
  },
};
