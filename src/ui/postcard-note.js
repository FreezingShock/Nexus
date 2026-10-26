// What the welcome-back postcard says. Pure: no DOM, so it is easy to test and easy to extend.
//
// A note is built from writers. Each writer takes the context { log, night, offline, town } and returns a short sentence
// or null. The first writer with something to say wins the opening line; the days and festivals line goes after it.
// Another system (a holiday, a festival, a town event) adds its own opening with addNoteWriter(fn), and it is tried
// before the built-in ones.

const BASE_NOTES = [
  'Dear mayor, everything stayed cozy while you were away. The lamps are lit and the bakery is still warm.',
  'Dear mayor, the streets were quiet and the cars kept their slow, steady rounds. Come and see what grew.',
  'Dear mayor, a gentle breeze moved through the pines and every chimney stayed warm. We saved your seat.',
];

// The last thing the mayor did before leaving gets a line of its own.
function lastAction({ log }) {
  const last = log && log[log.length - 1];
  if (!last) return null;
  const n = String(last.n || '').toLowerCase();
  if (last.k === 'up') return 'Dear mayor, your ' + n + ' has been shining since the upgrade, and the neighbours keep stopping to look.';
  if (last.k === 'road') return 'Dear mayor, the new road is open and the first cars have already found it.';
  if (last.k === 'doze') return 'Dear mayor, the lot where the ' + n + ' stood is quiet now, and wildflowers are coming up.';
  return null;
}

const extra = [];
export function addNoteWriter(fn) { if (typeof fn === 'function') extra.push(fn); return () => { const i = extra.indexOf(fn); if (i >= 0) extra.splice(i, 1); }; }

// Names joined the way a letter would: "A", "A and B", "A, B and 3 more".
export function festivalList(festivals, show = 2) {
  const names = [];
  for (const f of festivals || []) if (f && f.name && !names.includes(f.name)) names.push(f.name);
  if (!names.length) return '';
  const recent = names.slice(-show).reverse(), more = names.length - recent.length;
  if (more > 0) return recent.join(', ') + ' and ' + more + ' more';
  return recent.length === 1 ? recent[0] : recent.slice(0, -1).join(', ') + ' and ' + recent[recent.length - 1];
}

// One short line for the days away. Festival counts are left out: the card only has room for names.
export function daysLine(o) {
  if (!o || !o.days) return '';
  const days = o.days + (o.days > 1 ? ' days' : ' day') + ' went by';
  const fests = festivalList(o.festivals);
  return fests ? days + ', and we kept ' + fests + ' for you.' : days + '.';
}

export function writeNote(ctx, rand = Math.random) {
  let open = null;
  for (const w of [...extra, lastAction]) { open = w(ctx); if (open) break; }
  if (!open) open = BASE_NOTES[Math.floor(rand() * BASE_NOTES.length) % BASE_NOTES.length];
  if (ctx.night && !ctx.offline?.days) open += ' The lamps look lovely tonight.';
  const days = daysLine(ctx.offline);
  return days ? open + ' ' + days : open;
}

// The P.S. only when income eased off, so a short trip has a cleaner card.
export function postscript(o) {
  return o && o.easeS > 60 ? 'P.S. Nothing was lost. Income eases off after 4 hours away, up to 24 hours.' : '';
}
