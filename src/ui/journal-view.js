// The Journal page's markup. Pure: entries in, HTML out, so node tests cover it. Saved text only goes in through esc().
import { esc } from './cards.js';
import { KINDS, dateWords, groups } from '../core/journal.js';

export const JOURNAL_TABS_DEF = [
  { id: 'diary', label: 'Diary', color: '#E6BC62' },
  { id: 'folk', label: 'Townsfolk', color: '#D3E4C4' },
];

const entryHtml = (e, i) => {
  const kind = KINDS[e.k] || KINDS.town;
  const diary = e.t ? `<p class="jr-text">${esc(e.t)}</p>` : '';
  const say = e.s ? `<blockquote class="jr-say"><span>${esc(e.s.say)}</span><cite>${esc(e.s.who)}</cite></blockquote>` : '';
  return `<li class="jr-entry" style="--c:${kind.color};--i:${Math.min(i, 12)}"><div class="jr-date"><b>${esc(dateWords(e))}</b><i>${esc(kind.label)}</i></div>${diary}${say}</li>`;
};

export function journalHtml(entries, tab = 'diary') {
  const list = groups(entries, tab === 'folk' ? 'story' : 'all');
  if (!list.length) {
    return `<section class="pg-box jr-empty"><h3 class="h-disp">${tab === 'folk' ? 'No stories yet' : 'A blank first page'}</h3>
      <p class="pg-soft">${tab === 'folk' ? 'Neighbours tell the mayor things now and then. Give the town a few days.' : 'Things the town does will be written here: festivals, new seasons, the people who move in, and what happened while you were away.'}</p></section>`;
  }
  let n = 0;
  return `<div class="jr-book">${list.map((g) => `<section class="pg-box jr-month"><h3 class="h-disp">${esc(g.label)} <small>${g.items.length} ${g.items.length === 1 ? 'entry' : 'entries'}</small></h3>
    <ul class="jr-list">${g.items.map((e) => entryHtml(e, n++)).join('')}</ul></section>`).join('')}</div>`;
}

// One line under the page title.
export const journalSub = (entries) => (entries.length
  ? entries.length + (entries.length === 1 ? ' entry' : ' entries') + ' · the mayor writes it, the neighbours chip in'
  : 'The mayor keeps a diary of the town, and the neighbours chip in.');
