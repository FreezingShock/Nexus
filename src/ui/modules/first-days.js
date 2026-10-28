// First days for a brand-new town: a skippable welcome postcard once (a notebook page, never over the HUD), then a soft
// glow on the toolbar tool that suggests the next thing to try. The glow moves on when the step is done or the tool is
// picked up, and "No hints, thanks" turns it all off. Towns already being played get neither. Reads the town and sends
// nothing. Rules and words are pure in src/ui/first-days.js.
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { $ } from '../format.js';
import { LOOK, NUMBERS, PATH, advance, isVeteran, loadFirst, markSeen, nextPulse, saveFirst, stepsDoneIn } from '../first-days.js';

const WELCOME_AFTER_S = 0.5, PULSE_AFTER_S = 8, CHECK_S = 1;

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

    // The real toolbar icon and tint for a tool, and the HUD's own badges, so the card matches what is on screen.
    const toolIcon = (tool) => { const n = document.querySelector('.tool[data-tool="' + tool + '"] .ico'); return n ? { svg: n.innerHTML, c: n.style.getPropertyValue('--c') } : null; };
    const badge = (id) => { const n = document.querySelector('#' + id + ' .badge svg'); return n ? n.outerHTML : ''; };
    const NUM_ICON = { coins: () => badge('coinschip'), parts: () => badge('partschip'), happy: () => { const f = document.getElementById('hpface'); return f ? f.outerHTML : ''; }, demand: () => '', goals: () => PAGE_ICONS.goals };

    const steps = () => `<p class="fd-look"><b class="h-disp">${LOOK.head}</b>${LOOK.keys.map(([k, w]) => `<span><kbd>${k}</kbd> ${w}</span>`).join('')}</p>
      <ol class="fd-path">${PATH.map((s, i) => {
        const ic = toolIcon(s.tool);
        return `<li class="fd-tile" style="--tc:${(ic && ic.c) || s.c};--i:${i}"><span class="fd-ico">${ic ? ic.svg : ''}<i>${i + 1}</i></span>
          <span class="fd-text"><b class="h-disp">${s.head} <kbd>${s.key}</kbd></b><small>${s.text}</small></span></li>`;
      }).join('')}</ol>`;
    const numbers = () => `<ul class="fd-path fd-nums">${NUMBERS.map((n, i) => `<li class="fd-tile" style="--tc:${n.c};--i:${i}"><span class="fd-ico">${NUM_ICON[n.id]()}</span>
        <span class="fd-text"><b class="h-disp">${n.head}</b><small>${n.text}</small></span></li>`).join('')}</ul>`;

    book.register('firstdays', {
      title: 'Welcome, mayor', c: '#A8C179', icon: PAGE_ICONS.goals, compact: true,
      tabs: [{ id: 'steps', label: 'First steps', color: '#D3E4C4', icon: PAGE_ICONS.goals }, { id: 'numbers', label: 'Your numbers', color: '#F2D27A', icon: PAGE_ICONS.milestones }],
      sub: () => 'A small village is waiting. Here is how to begin, and nothing is timed.',
      render: ({ tab }) => (tab === 'numbers' ? numbers() : steps()) + `<div class="fd-foot"><button class="btn primary" type="button" data-act="go">Let's go</button>
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
