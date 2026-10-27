// The town journal (core/journal.js has the words). Saved as state.journal = { entries, seen }:
//   entries  the diary, oldest first, at most MAX_ENTRIES
//   seen     keys already written, so a festival or a population step is never written twice
// Entries come from events the sim already raises (festivals, seasons, first snow, milestones, a Renewal) and from a slow
// look at the town (population steps, the first home you built). Time away becomes one entry, never a loop over days.
// The first look at a town that has no journal only writes a first page and notes what is already true, so a loaded
// town does not get a flood of old news. A Renewal keeps the journal.
import { MAX_ENTRIES, MAX_SEEN, POP_STEPS, awayText, entryFor, hasStoryToday, moodFor, sanitizeEntries, sanitizeSeen } from '../../core/journal.js';

const LOOK_EVERY = 5; // ticks between looks at the town

const when = (state) => ({ d: state.dayIdx, y: state.year, m: state.month, n: state.dayOfMonth });

// Writes an entry unless its key is already in the book. Returns it, or null.
export function write(ctx, spec) {
  const { state, emit } = ctx, j = state.journal;
  if (j.seen.includes(spec.key)) return null;
  const e = entryFor(spec, when(state));
  if (!e) return null;
  j.seen.push(spec.key);
  if (j.seen.length > MAX_SEEN) j.seen.splice(0, j.seen.length - MAX_SEEN);
  j.entries.push(e);
  if (j.entries.length > MAX_ENTRIES) j.entries.splice(0, j.entries.length - MAX_ENTRIES);
  emit({ type: 'journalEntry', id: e.i });
  return e;
}

const builtHome = (state) => state.lots.length > 0 || state.placed.some((r) => !r.starter);

function look(ctx) {
  const { state } = ctx, j = state.journal;
  const passed = POP_STEPS.filter((n) => state.pop >= n);
  if (!j.entries.length && !j.seen.length) {
    // A town with no journal yet: note what is already true, then open the book.
    for (const n of passed) j.seen.push('pop:' + n);
    if (builtHome(state)) j.seen.push('home');
    write(ctx, { kind: 'story', key: 'start', a: { mood: 'plain', t: 'I started keeping a journal today, so I can remember how the town grew.' } });
    return;
  }
  if (builtHome(state)) write(ctx, { kind: 'home', key: 'home' });
  // Only the biggest new step is written; the smaller ones it passed are marked as seen.
  const newer = passed.filter((n) => !j.seen.includes('pop:' + n));
  if (newer.length) {
    const top = newer[newer.length - 1];
    for (const n of newer) if (n !== top) j.seen.push('pop:' + n);
    write(ctx, { kind: 'pop', key: 'pop:' + top, a: { n: top } });
  }
  const o = state.offline;
  if (o && (o.days >= 1 || o.awayS >= 3600)) write(ctx, { kind: 'away', key: 'away:' + Math.round(o.awayS) + ':' + (o.days | 0), a: { t: awayText(o) } });
}

export default {
  id: 'journal',
  state: () => ({ journal: { entries: [], seen: [] } }),
  sanitize: (raw) => ({ journal: { entries: sanitizeEntries(raw.journal && raw.journal.entries), seen: sanitizeSeen(raw.journal && raw.journal.seen) } }),
  init(ctx) {
    const { sim } = ctx;
    ctx.journalClock = LOOK_EVERY - 2; // a first look a moment after load
    if (sim.journalListening) return; // init runs again after a Renewal; the listener is made once
    sim.journalListening = true;
    sim.subscribe((e) => {
      const { state } = ctx;
      if (!state.journal) return;
      switch (e.type) {
        case 'holiday': write(ctx, { kind: 'holiday', key: 'hol:' + e.id + ':' + state.year, a: { title: e.title, text: e.text } }); break;
        case 'eventStart': write(ctx, { kind: 'event', key: 'ev:' + e.id + ':' + state.year, a: { title: e.title, text: e.text } }); break;
        case 'firstSnow': write(ctx, { kind: 'snow', key: 'snow:' + state.year, a: { text: e.text } }); break;
        case 'keepsake': write(ctx, { kind: 'keepsake', key: 'kp:' + e.id, a: { text: e.text } }); break;
        case 'milestone': write(ctx, { kind: 'milestone', key: 'ms:' + (e.title || '') + ':' + state.dayIdx, a: { title: e.title, sub: e.sub } }); break;
        case 'renewed': write(ctx, { kind: 'story', key: 'renew:' + state.renewals, a: { mood: 'plain', t: 'A fresh start. The land is new, but I remember everything.' } }); break;
        case 'newMonth':
          if ([2, 5, 8, 11].includes(e.month)) write(ctx, { kind: 'season', key: 'season:' + e.year + ':' + e.month, a: { season: state.season } });
          break;
        case 'newDay':
          if (hasStoryToday(e.dayIdx)) write(ctx, { kind: 'story', key: 'amb:' + e.dayIdx, a: { mood: moodFor(state) } });
          break;
        default:
      }
    });
  },
  tick(ctx) {
    if (++ctx.journalClock < LOOK_EVERY) return;
    ctx.journalClock = 0;
    look(ctx);
  },
};
