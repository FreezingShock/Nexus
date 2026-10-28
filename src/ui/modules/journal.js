// The town journal: a notebook page (src/ui/book.js) on J with a diary of what happened and the neighbours' stories. Words
// come from src/core/journal.js, written by the sim (sim/systems/journal.js); this only reads state.journal. A new entry
// puts a small dot on the menu tile until the page is opened. Also lends the latest story to the welcome-back postcard.
import { $ } from '../format.js';
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { JOURNAL_TABS_DEF, journalHtml, journalSub } from '../journal-view.js';
import { addNoteWriter } from '../postcard-note.js';

const TAB_ICONS = { diary: PAGE_ICONS.journal, folk: PAGE_ICONS.town };
export const JOURNAL_TABS = JOURNAL_TABS_DEF.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }));

export default {
  id: 'journal',
  order: 200, // after the road tool, which keeps J for Replace while drawing
  create({ sim }) {
    const s = sim.state;
    // The button lives in index.html: the menu (order 100) dresses its rows before this module (order 200) is created.
    const btn = $('journalbtn');
    const dot = btn.querySelector('.dot');
    let fresh = false;

    book.register('journal', {
      title: 'Town journal', c: '#E6BC62', icon: PAGE_ICONS.journal, tabs: JOURNAL_TABS,
      sub: () => journalSub(s.journal.entries),
      render: ({ tab }) => journalHtml(s.journal.entries, tab),
      opened() { fresh = false; dot.hidden = true; },
    });
    btn.onclick = () => book.toggle('journal');

    // The postcard opens with the latest neighbour's words when they said something since the last card.
    addNoteWriter(({ offline }) => {
      if (!offline) return null;
      const last = [...s.journal.entries].reverse().find((e) => e.s && e.d >= s.dayIdx - 9);
      return last ? 'Dear mayor, ' + last.s.who + ' asked me to pass this on: "' + last.s.say + '"' : null;
    });

    return {
      onKey(e) {
        if (e.key.toLowerCase() === 'j' && !e.repeat) { book.toggle('journal'); return true; }
        return false;
      },
      onEvent(e) {
        if (e.type !== 'journalEntry') return;
        if (book.current() === 'journal') { book.refresh(); return; }
        fresh = true; dot.hidden = false;
      },
    };
  },
};
