// The town journal: a mayor's diary of what happened, with little stories from townsfolk. Pure (no DOM, no Three.js), so
// node tests cover it. The sim (sim/systems/journal.js) decides WHEN something is worth writing and calls entryFor;
// the same key always gives the same words (a hash picks the template and the neighbour), so a story never changes
// after it is written and nothing here needs a random number generator.
//
// An entry: { i key, d day number, y year, m month (0 to 11), n day of month, k kind, t diary line, s? story }.
// A story: { who, say } (a neighbour and what they said).
import { MONTH_SHORT } from './calendar.js';

export const MAX_ENTRIES = 150;  // older entries fall off the back; the journal stays a small part of a save
export const MAX_SEEN = 400;     // keys already written, so an event is never written twice

export const KINDS = {
  first: { label: 'Firsts', color: '#A8C179' },
  town: { label: 'The town', color: '#E6BC62' },
  festival: { label: 'Festivals', color: '#E3A08E' },
  season: { label: 'Seasons', color: '#8FB8D6' },
  away: { label: 'Away', color: '#C9A6C9' },
  story: { label: 'Townsfolk', color: '#D3E4C4' },
};

export const NAMES = ['Ines', 'Tomas', 'Marta', 'Oskar', 'Elsa', 'Pavel', 'Greta', 'Luca', 'Hanne', 'Joris', 'Mirela', 'Anton',
  'Sabine', 'Kasper', 'Livia', 'Emil', 'Odette', 'Bram', 'Noor', 'Felix', 'Ada', 'Matteo', 'Wilma', 'Dario'];

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h ^ (h >>> 15)) >>> 0;
}
const pick = (list, key, salt = '') => list[hash(key + salt) % list.length];
const nameFor = (key, salt = '') => pick(NAMES, key, '#who' + salt);

// What neighbours say, by the moment. {w} is the neighbour's name, filled in by the caller only where a template needs it.
const SAYS = {
  home: [
    'I finally have a front door with a bell on it. Every visitor sounds like good news.',
    'The kettle is on, the curtains are up, and I have not stopped smiling at the wallpaper.',
    'Our street smells of fresh paint. I think I will leave the windows open all day.',
  ],
  crowd: [
    'There are so many of us now that the baker has started a queue, and nobody minds.',
    'I said good morning to six people before breakfast. Six! It used to be one, and the cat.',
    'I counted the lit windows tonight and lost track. What a lovely thing to lose track of.',
  ],
  festival: [
    'I ate too much and I would do it again. Please tell the baker.',
    'The children fell asleep on the green with their lanterns still glowing. I will remember that for years.',
    'Somebody started singing and, one by one, the whole street joined in. Even the grumpy ones.',
  ],
  away: [
    'We kept your chair by the window and the lamp lit. It was quiet without you, mayor.',
    'Nothing broke, nobody quarrelled, and the geese stayed out of the square. A very good week.',
    'We told the pigeons you would be back. They did not believe us, but here you are.',
  ],
  spring: [
    'The first crocus came up by the bus bench. I have decided it is mine.',
    'The river is loud again and the fields smell of rain. Spring has arrived, whatever the calendar says.',
  ],
  summer: [
    'The evenings go on and on. I had supper on the doorstep and nobody told me to come in.',
    'The bakery window is open all day now, and the whole street smells of warm bread.',
  ],
  autumn: [
    'The leaves are piling up on the pavements and I have not swept a single one. They look too good.',
    'Pumpkins on the market stall, scarves out of the drawer. I do love this part of the year.',
  ],
  winter: [
    'Frost on the windows this morning. I drew a little house in it and then felt silly. Then I drew a second one.',
    'Soup on every stove tonight. You can smell it all the way down the high street.',
  ],
  rain: [
    'It rained all afternoon and the whole street went quiet and golden. I watched from the window.',
    'Everybody is carrying an umbrella and nobody is in a hurry. It suits the town.',
  ],
  snow: [
    'Snow! The postman made a snowman instead of the rounds, and honestly, fair enough.',
    'The roofs are white and the streetlamps wear little hats. I could stand here all night.',
  ],
  market: [
    'The cheese man gave me a free slice and told me it was a secret. It is not a secret now.',
    'I only went for eggs and came home with a plant, a scarf and a new friend.',
  ],
  plain: [
    'Nothing much happened today, and I spent all of it feeling lucky.',
    'The cars go round, the lamps come on, and the town hums along. Thanks for looking after us.',
    'I took the long way home today just to see the roofs. They look good from every side.',
    'The dog next door has learned to open the gate. We are all very proud and slightly worried.',
  ],
};

export function sayFor(kind, key) { const list = SAYS[kind] || SAYS.plain; return pick(list, key, '#say'); }

export function storyFor(kind, key) { return { who: nameFor(key), say: sayFor(kind, key) }; }

// The diary half of an entry: the mayor, writing to themselves.
const POP = {
  10: 'Ten neighbours now. Somebody waved at me from a window today.',
  25: 'Twenty-five people call the town home. The first small crowd gathered at the corner, just to chat.',
  50: 'Fifty residents! Someone suggested a town band. I did not say no.',
  100: 'A hundred people live here. It has stopped feeling like a village I am building and started feeling like a place.',
  250: 'Two hundred and fifty neighbours. The high street has a hum to it I did not plan for.',
  500: 'Five hundred people. The bakery needs a second oven and the school needs a second bell.',
  1000: 'A thousand residents. I stood on the hill at dusk and counted the lit windows until I gave up.',
  2500: 'Two and a half thousand. The town has its own weather of gossip now.',
  5000: 'Five thousand. Somebody called it a city today and everybody gasped, then looked pleased.',
};
export const POP_STEPS = Object.keys(POP).map(Number);

export const SEASON_LINES = {
  spring: 'Spring has come to the town. Windows open, coats come off.',
  summer: 'Summer begins. Long light, short shadows, and the river sparkling.',
  autumn: 'Autumn is here. The roofs look warmer against the fields.',
  winter: 'Winter settles in. Lamps on early and soup on the stove.',
};

// Words for each kind of moment. `a` is what the caller knows (title, name, count, season, weather).
export function entryFor(spec, when) {
  const { kind, key, a = {} } = spec;
  let t = '', say = '', k = 'town';
  switch (kind) {
    case 'home': k = 'first'; t = 'The first home I built myself is finished. It looks smaller than I expected, and perfect.'; say = 'home'; break;
    case 'pop': k = 'town'; t = POP[a.n] || ('The town now has ' + a.n + ' people in it.'); say = a.n >= 100 ? 'crowd' : 'home'; break;
    case 'holiday': k = 'festival'; t = a.title + '. ' + (a.text || 'The whole town came out for it.'); say = 'festival'; break;
    case 'event': k = 'festival'; t = a.text || (a.title + ' is coming.'); say = 'festival'; break;
    case 'snow': k = 'season'; t = a.text || 'The first snow of the year. The rooftops went white overnight.'; say = 'snow'; break;
    case 'season': k = 'season'; t = SEASON_LINES[a.season] || 'The season has turned.'; say = a.season; break;
    case 'milestone': k = 'town'; t = (a.title ? a.title + '. ' : '') + (a.sub || a.text || 'Another goal reached.'); say = 'crowd'; break;
    case 'keepsake': k = 'first'; t = a.text || 'A keepsake has found its way into the town.'; say = 'festival'; break;
    case 'away': k = 'away'; t = a.t; say = 'away'; break;
    case 'story': k = 'story'; t = a.t || ''; say = a.mood || 'plain'; break;
    default: return null;
  }
  const e = { i: key, d: when.d, y: when.y, m: when.m, n: when.n, k, t: String(t).slice(0, 220) };
  // Plain diary lines for small things carry no story; the bigger ones add a neighbour's voice.
  if (say && (kind === 'story' || spec.story !== false)) e.s = storyFor(say, key);
  return e;
}

// A line for the days away. Used by the sim when the welcome-back postcard is waiting.
export function awayText(o) {
  if (!o) return '';
  const days = o.days || 0;
  const hours = Math.round((o.awayS || 0) / 3600);
  const span = days >= 1 ? days + (days === 1 ? ' day' : ' days') : (hours >= 1 ? hours + (hours === 1 ? ' hour' : ' hours') : 'a little while');
  const fest = (o.festivals || []).map((f) => f.name).filter(Boolean);
  const list = fest.length === 0 ? '' : fest.length === 1 ? fest[0] : fest.slice(0, -1).join(', ') + ' and ' + fest[fest.length - 1];
  return 'I was away for ' + span + '.' + (list ? ' The town kept ' + list + ' without me.' : ' The town ticked along without me.');
}

// What an ordinary day might hold. Picked from the day, the season, the weather and whether it is market day.
export function moodFor(state) {
  if (state.weatherKind === 'snow') return 'snow';
  if (state.weatherKind === 'rain') return 'rain';
  if (state.market) return 'market';
  const h = hash('mood' + state.dayIdx) % 3;
  return h === 0 ? 'plain' : (state.season || 'plain');
}

// One ordinary day in three has a story. A hash of the day decides, so a reload never changes it.
export const hasStoryToday = (dayIdx) => hash('amb' + dayIdx) % 3 === 0;

export const dateWords = (e) => e.n + ' ' + MONTH_SHORT[e.m] + ', Year ' + e.y;

// Newest first, optionally only some kinds.
export function visible(entries, filter = 'all') {
  const list = filter === 'all' ? entries : entries.filter((e) => (filter === 'story' ? !!e.s : e.k === filter));
  return [...list].reverse();
}

// Entries grouped by month, newest first: [{ label, items }].
export function groups(entries, filter = 'all') {
  const out = [];
  for (const e of visible(entries, filter)) {
    const label = MONTH_SHORT[e.m] + ', Year ' + e.y;
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(e); else out.push({ label, items: [e] });
  }
  return out;
}

// Clamp untrusted saved entries to the shape above.
export function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const int = (x, d, lo, hi) => (Number.isInteger(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object' || typeof e.i !== 'string' || typeof e.t !== 'string' || !KINDS[e.k]) continue;
    const s = e.s && typeof e.s === 'object' && typeof e.s.who === 'string' && typeof e.s.say === 'string'
      ? { who: e.s.who.slice(0, 20), say: e.s.say.slice(0, 220) } : null;
    out.push({ i: e.i.slice(0, 40), d: int(e.d, 0, 0, 1e7), y: int(e.y, 1, 1, 1e5), m: int(e.m, 0, 0, 11), n: int(e.n, 1, 1, 31),
      k: e.k, t: e.t.slice(0, 220), ...(s ? { s } : {}) });
  }
  return out.slice(-MAX_ENTRIES);
}
export const sanitizeSeen = (raw) => (Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(-MAX_SEEN) : []);
