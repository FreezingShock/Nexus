// The title screen and the progress screen (markup is in index.html, styles in css/title.css). This file only drives
// them: main.js feeds it the load progress and the town's snapshot, and is told when Play or New town is chosen.
// The left card holds Play and the menu rows; a row opens its page as a big notebook sheet in the middle of the screen,
// which flips open from its spine with a paper rustle and the page's own chime. The sheet is the shared one in
// src/ui/notebook.js, the same the town's pages use.
import { $, fmt } from './format.js';
import { VERSION } from '../version.js';
import { CHANGELOG, KINDS, newSince, kindCounts } from '../changelog.js';
import { CREDITS, saveLine, tipOfTheDay } from '../core/boot.js';
import { createPageSounds } from '../audio/page-sounds.js';
import { createNotebook, notebookMarkup } from './notebook.js';
import { ICONS, KIND_ICONS, STEP_ICONS, EMBLEM_ICONS, GROUP_ICONS } from './title-icons.js';
import { RANKS, EMBLEMS, COLORS, rankFor, initials, playTime, NAME_MAX } from '../core/profile.js';
import { GOALS, GROUPS, STAGES, standing, summary, nearest, fmtTarget } from '../sim/achievements.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEEN_KEY = 'nexus.seenVersion';
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* the badge just shows again */ } };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => { const [y, m, day] = d.split('-').map(Number); return day + ' ' + MONTHS[m - 1] + ' ' + y; };
const k = (t) => `<kbd>${t}</kbd>`;

const PRESETS = [
  { id: 'low', name: 'Low', text: 'For older computers: fewer details and no shadows.' },
  { id: 'medium', name: 'Medium', text: 'Lighter work for the graphics card, smooth on most laptops.' },
  { id: 'high', name: 'High', text: 'The town as it was drawn.' },
  { id: 'ultra', name: 'Ultra', text: 'Everything on, for strong graphics cards.' },
];

// The menu rows on the left card, top to bottom. `gap` draws a dashed rule above a row.
export const ROWS = [
  { id: 'howto', label: 'How to play', sub: 'your first five minutes', c: '#C9DDB8' },
  { id: 'changes', label: 'Changes', sub: 'every version, in colour', c: '#F2D27A' },
  { id: 'credits', label: 'Credits', sub: 'who made this and with what', c: '#F0C4B6' },
  { id: 'profile', label: 'Mayor profile', sub: 'your name, rank and badges', c: '#E9C1B8', gap: true, needsReady: true },
  { id: 'pass', label: 'Passes', sub: 'Lantern Pass and Town Charter', c: '#F2D27A', tag: 'Soon' },
  { id: 'settings', label: 'Settings', sub: 'graphics and sound', c: '#DCE8EC', gap: true, needsReady: true },
  { id: 'new', label: 'New town', sub: 'start over, keeping a backup', c: '#E9DCC4', needsReady: true },
];

// Every page's header: title, the line under it, and its accent colour.
export const PAGES = {
  howto: { title: 'How to play', sub: 'Five small steps, then the town is yours', c: '#A8C179' },
  changes: { title: 'Changes', sub: 'Every version of Nexus, newest first', c: '#E6BC62' },
  credits: { title: 'Credits', sub: 'Who made Nexus, and with what', c: '#E3A08E' },
  profile: { title: 'Mayor profile', sub: 'Your name, rank, personal bests and badges', c: '#E3A08E' },
  pass: { title: 'Passes', sub: 'A someday way to say thank you. Nothing is sold yet.', c: '#E6BC62' },
  settings: { title: 'Settings', sub: 'Changes save straight away', c: '#8FB8D6' },
  new: { title: 'Start a new town?', sub: 'Your current town is kept as a backup', c: '#C9A27A', narrow: true },
};

export const HOWTO_STEPS = [
  { icon: 'look', head: 'Look around', text: `Drag to pan, scroll to zoom, ${k('Q')} ${k('E')} to turn. ${k('F')} flies low through the streets.` },
  { icon: 'road', head: 'Lay a road', text: `Press ${k('R')} and click from one point to the next. Roads find their own bends.` },
  { icon: 'zone', head: 'Paint zones', text: `${k('Z')} paints homes, shops and workshops beside your streets. They grow on their own.` },
  { icon: 'grow', head: 'Help it grow', text: `Click a building to upgrade it. Add services and parks with ${k('C')} and ${k('P')} to make people happy.` },
  { icon: 'away', head: 'Come back later', text: 'Coins and Parts keep arriving while you are away, and a postcard tells you what happened.' },
];
const KEYS = [['R', 'Roads'], ['Z', 'Zones'], ['B', 'Buildings'], ['C', 'Services'], ['P', 'Parks'], ['Y', 'Decor'], ['N', 'Districts'], ['X', 'Bulldoze'], ['M', 'Milestones'], ['K', 'Calendar'], ['O', 'Photo mode'], ['F', 'Fly']];

// The two pass cards: placeholders only. No price, no payment, no account, no network; the button shows a note.
export const PASSES = [
  { id: 'lantern', name: 'Lantern Pass', icon: 'pass', color: '#E6BC62', title: 'Evenings in Nexus', cta: 'Light the lantern',
    blurb: 'For mayors who love the town after dark.',
    perks: [['Evening palettes', 'for walls, roofs and street lamps'], ['Lantern festivals', 'with floating lights over the river'], ['Six night emblems', 'for your mayor picture'], ['Starry postcards', 'when you come back at night']],
    note: 'The lanterns are still being folded. One day this may be a way to support Nexus. For now there is nothing to buy, and your town has everything it needs.' },
  { id: 'charter', name: 'Town Charter', icon: 'charter', color: '#A8C179', title: 'A charter for your town', cta: 'Seal the charter',
    blurb: 'For founders who want their town on paper.',
    perks: [['A wax seal', 'on your mayor profile'], ['Founding day', 'celebrated every year in the calendar'], ['Gilded district flags', 'that catch the morning sun'], ['Your name', 'in the town hall foyer']],
    note: 'The ink on the charter is still drying. Nothing is for sale. Go and enjoy your streets.' },
];

// The version badge colours, cycled down the changelog.
const VERSION_COLORS = ['#B8472E', '#5F7A3E', '#C08A2E', '#35566A', '#97553E', '#7A5C86'];

export function createTitle({ onPlay, onNewTown }) {
  const title = $('title'), boot = $('boot'), play = $('tt-play'), list = $('tt-list');
  title.querySelector('.tt-credit').insertAdjacentHTML('beforebegin', notebookMarkup('tt'));
  const body = $('tt-sheet-body');
  let ready = false, stores = null, isNew = false, filter = 'all', town = null;
  const seen = readSeen();
  let fresh = newSince(seen);
  const sounds = createPageSounds({ getSettings: () => (stores ? stores.sound.get() : null) });

  $('tt-ver').textContent = 'v' + VERSION;
  $('tt-tip').innerHTML = '<b>Tip</b> ' + esc(tipOfTheDay(new Date()));

  // ---- the rows
  list.innerHTML = ROWS.map((r) => `${r.gap ? '<hr class="tt-gap">' : ''}<button class="tt-row" id="tt-${r.id}" type="button" data-page="${r.id}" aria-haspopup="dialog"${r.needsReady ? ' disabled' : ''}>
      <span class="tt-ico" style="--c:${r.c}">${ICONS[r.id]}</span><span class="tt-rowtext"><b>${r.label}</b><small>${r.sub}</small></span>
      ${r.tag ? `<span class="tt-tag">${r.tag}</span>` : ''}</button>`).join('');
  const rowEl = (id) => $('tt-' + id);
  function markFresh() {
    if (!fresh.length || rowEl('changes').querySelector('.tt-badge')) return;
    rowEl('changes').insertAdjacentHTML('beforeend', `<span class="tt-badge">${fresh.length > 1 ? fresh.length + ' new' : 'New'}</span>`);
  }
  markFresh();

  // ---- the pages
  const pages = {
    howto: () => `<ol class="ht-steps">${HOWTO_STEPS.map((s, i) => `<li class="ht-step" style="--i:${i}">
        <span class="ht-n">${i + 1}</span><span class="ht-ico">${STEP_ICONS[s.icon]}</span><b class="h-disp">${s.head}</b><p>${s.text}</p></li>`).join('')}</ol>
      <h3 class="nb-h3 h-disp">Handy keys</h3>
      <ul class="ht-keys">${KEYS.map(([key, name]) => `<li>${k(key)}<span>${name}</span></li>`).join('')}</ul>
      <p class="nb-promise">Nothing here ever punishes you. Your town saves itself every 45 seconds. Take your time.</p>`,
    changes: () => {
      const total = CHANGELOG.reduce((n, e) => n + e.items.length, 0);
      const chips = [['all', 'Everything', '#FBF6EA'], ...Object.entries(KINDS).map(([id, kd]) => [id, kd.label, kd.color])];
      return `<div class="cl-top">
          <p class="cl-stats"><b>${CHANGELOG.length}</b> versions · <b>${total}</b> changes since ${fmtDate(CHANGELOG.at(-1).date)}</p>
          <div class="nb-chips cl-filter" data-k="filter">${chips.map(([id, label, c]) => `<button class="nb-chip" type="button" data-v="${id}" style="--c:${c}" aria-pressed="${filter === id}">${id === 'all' ? '' : `<i>${KIND_ICONS[id]}</i>`}${label}</button>`).join('')}</div>
        </div>
        <ol class="cl-list" id="cl-list">${changeList()}</ol>`;
    },
    credits: () => `<div class="cr-grid">${CREDITS.map((c, i) => `<section class="cr-card" style="--i:${i}"><h3 class="tt-eyebrow">${esc(c.head)}</h3>${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('')}</div>
      <p class="nb-promise">Thank you for playing. Every town is a little different, and yours is the only one like it.</p>`,
    settings: () => {
      const q = stores.quality.get(), s = stores.sound.get();
      return `<h3 class="nb-h3 h-disp">Graphics</h3>
        <div class="st-cards" data-k="preset">${PRESETS.map((p) => `<button class="st-card" type="button" data-v="${p.id}" aria-pressed="${q.preset === p.id}"><b>${p.name}</b><small>${p.text}</small></button>`).join('')}</div>
        <h3 class="nb-h3 h-disp">Sound</h3>
        <div class="st-row"><span><b>Sound</b><small>Music and the sounds of the town start once you press Play.</small></span>
          <div class="nb-chips" data-k="sound"><button class="nb-chip" type="button" data-v="on" aria-pressed="${!s.muted}">On</button><button class="nb-chip" type="button" data-v="off" aria-pressed="${s.muted}">Muted</button></div></div>
        <label class="st-row"><span><b>Volume</b><small>Everything at once. The rest wait in the town, under the menu.</small></span>
          <input type="range" min="0" max="100" step="5" value="${Math.round(s.master * 100)}" data-k="master" aria-label="Volume"></label>
        <p class="nb-promise">Seasons, weather, saves and more wait in the town, under the menu.</p>`;
    },
    profile: () => profilePage(),
    pass: () => `<div class="ps-grid">${PASSES.map((p, i) => `<article class="ps-card ps-${p.id}" style="--i:${i}">
        <span class="ps-sky" aria-hidden="true"></span>
        <header><span class="ps-chip">${ICONS[p.icon]}${p.name}</span><span class="ps-soon">coming someday</span></header>
        <h3 class="h-disp">${p.title}</h3>
        <p class="ps-blurb">${p.blurb}</p>
        <ul>${p.perks.map(([b, rest]) => `<li><i aria-hidden="true">✓</i><span><b>${b}</b> ${rest}</span></li>`).join('')}</ul>
        <div class="ps-price"><b>Not yet</b><small>nothing to buy, nothing to sign up for</small></div>
        <button class="ps-btn" type="button" data-act="pass" data-v="${p.id}">${p.cta}</button>
      </article>`).join('')}</div>
      <aside class="ps-note" id="ps-note" data-mo="pop" hidden></aside>
      <p class="nb-promise">These cards are placeholders. Nothing is sold, nothing is charged and nothing leaves your browser.</p>`,
    new: () => `<p>You begin again with the small starter village. Your current town moves to the backup slot, and Settings in the town can bring it back.</p>
        <div class="nb-btns"><button class="btn" type="button" data-act="cancel">Keep my town</button><button class="btn primary" type="button" data-act="new">Start fresh</button></div>`,
  };

  function changeList() {
    return CHANGELOG.map((e, i) => {
      const items = e.items.filter((it) => filter === 'all' || it.k === filter);
      if (!items.length) return '';
      const isFresh = fresh.includes(e);
      return `<li class="cl-entry${isFresh ? ' fresh' : ''}" style="--vc:${VERSION_COLORS[i % VERSION_COLORS.length]};--i:${Math.min(i, 6)}">
        <details${i < 2 || filter !== 'all' ? ' open' : ''}><summary>
          <span class="cl-v">${esc(e.v)}</span>
          <span class="cl-title"><b class="h-disp">${esc(e.name)}</b><small>${fmtDate(e.date)} · ${esc(e.blurb)}</small></span>
          <span class="cl-counts">${kindCounts(e).map((c) => `<i style="--c:${KINDS[c.k].color}" title="${KINDS[c.k].label}">${c.n}</i>`).join('')}</span>
          ${isFresh ? '<span class="cl-fresh">New since you last played</span>' : ''}
        </summary>
        <ul class="cl-items">${items.map((it) => `<li><span class="cl-kind" style="--c:${KINDS[it.k].color}" title="${KINDS[it.k].label}">${KIND_ICONS[it.k]}</span><span>${esc(it.t)}</span>${it.pr ? `<span class="cl-pr">#${it.pr}</span>` : ''}</li>`).join('')}</ul>
        </details></li>`;
    }).join('');
  }

  // ---- the mayor profile
  const avatar = (p) => (p.emblem !== 'initials' && EMBLEM_ICONS[p.emblem]) ? EMBLEM_ICONS[p.emblem] : `<span class="pf-init">${esc(initials(p.name)) || '?'}</span>`;
  function profilePage() {
    const p = stores.profile.get(), st = town ? summary(town) : { stages: 0, totalStages: 0 };
    const r = rankFor(Math.max(p.bestStages, st.stages));
    const tiles = [
      ['clock', playTime(p.playMs), 'played'],
      ['people', fmt(p.popRecord), 'population record'],
      ['towns', fmt(p.towns), p.towns === 1 ? 'town started' : 'towns started'],
      ['coins', town ? fmt(town.earned || 0) : '0', 'coins this town has earned'],
    ];
    const next = town ? nearest(town, 1)[0] : null;
    return `<section class="pf-head" style="--pc:${p.color}">
        <span class="pf-avatar" id="pf-avatar">${avatar(p)}</span>
        <div class="pf-id">
          <label class="tt-eyebrow" for="pf-name">Mayor</label>
          <input class="pf-name h-disp" id="pf-name" type="text" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="What should the town call you?" value="${esc(p.name)}">
          <p class="pf-rank">Rank <b>${r.rank.name}</b> · mayor since ${fmtDate(p.since)}</p>
          <div class="pf-rankbar" role="progressbar" aria-label="Progress to the next rank" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.frac * 100)}"><i style="width:${Math.round(r.frac * 100)}%"></i></div>
          <small class="pf-tonext">${r.next ? `${r.toNext} more badge stage${r.toNext === 1 ? '' : 's'} to <b>${r.next.name}</b>` : 'The top of the ladder. The town is proud of you.'}</small>
        </div>
        <ul class="pf-stats">${tiles.map(([id, v, label]) => `<li class="pf-stat-${id}"><b>${esc(v)}</b><small>${label}</small></li>`).join('')}</ul>
      </section>
      <section class="pf-pick">
        <div><span class="tt-eyebrow">Picture</span><div class="pf-emblems" data-k="emblem">${EMBLEMS.map((e) => `<button class="pf-emblem" type="button" data-v="${e}" aria-pressed="${p.emblem === e}" aria-label="${e === 'initials' ? 'Initials' : e}" style="--pc:${p.color}">${e === 'initials' ? `<span class="pf-init">${esc(initials(p.name)) || 'AB'}</span>` : EMBLEM_ICONS[e]}</button>`).join('')}</div></div>
        <div><span class="tt-eyebrow">Colour</span><div class="pf-colors" data-k="color">${COLORS.map((c) => `<button class="pf-color" type="button" data-v="${c}" aria-pressed="${p.color === c}" aria-label="Colour ${c}" style="--pc:${c}"></button>`).join('')}</div></div>
      </section>
      <div class="pf-cols">
        <section class="pf-badges">
          <header><h3 class="h-disp">Badges</h3><span class="pf-count"><b>${st.stages}</b> of ${st.totalStages} stages</span><span class="pf-allbar"><i style="width:${st.totalStages ? Math.round(st.stages / st.totalStages * 100) : 0}%"></i></span></header>
          ${next ? `<p class="pf-next"><b>Next up:</b> ${esc(next.goal.name)}, ${esc(fmtTarget(next.goal, next.next))}. ${esc(next.goal.blurb)}</p>` : ''}
          ${GROUPS.map((g) => `<h4 class="pf-group">${esc(g.name)}</h4><ul class="pf-grid">${GOALS.filter((x) => x.group === g.id).map((goal) => badge(goal)).join('')}</ul>`).join('')}
        </section>
        <aside class="pf-ladder"><h3 class="h-disp">Ranks</h3><ol>${RANKS.map((rk, i) => `<li class="${i === r.index ? 'now' : i < r.index ? 'past' : ''}"><span>${i + 1}</span><b>${rk.name}</b><small>${i === r.index ? 'you are here' : rk.stages + ' stages'}</small></li>`).reverse().join('')}</ol>
          <p class="pf-note">Your name, picture and bests stay in this browser, and stay with you when you start a new town.</p></aside>
      </div>`;
  }
  function badge(goal) {
    const s = town ? standing(town, goal) : { done: 0, total: goal.tiers.length, frac: 0, next: goal.tiers[0], complete: false };
    const stage = s.done ? STAGES[s.done - 1] : null;
    return `<li class="pf-badge${stage ? ' got' : ''}" style="--sc:${stage ? stage.color : '#E9DCC4'}">
        <span class="pf-medal">${GROUP_ICONS[goal.group]}${stage ? `<i>${s.done}</i>` : ''}</span>
        <span><b>${esc(goal.name)}</b><small>${stage ? stage.name : 'Not yet'}${s.complete ? ', every stage' : ` · next ${esc(fmtTarget(goal, s.next))}`}</small>
        ${s.complete ? '' : `<span class="pf-bar"><i style="width:${Math.round(s.frac * 100)}%"></i></span>`}</span></li>`;
  }

  const book = createNotebook({
    get: $, prefix: 'tt', sounds,
    pages: Object.fromEntries(ROWS.map((r) => [r.id, { ...PAGES[r.id], icon: ICONS[r.id], render: () => pages[r.id]() }])),
    onShow(name) {
      for (const r of ROWS) rowEl(r.id).setAttribute('aria-expanded', String(r.id === name));
      if (name === 'changes') { writeSeen(VERSION); const bd = rowEl('changes').querySelector('.tt-badge'); if (bd) bd.remove(); }
    },
    onHide(was) {
      for (const r of ROWS) rowEl(r.id).setAttribute('aria-expanded', 'false');
      rowEl(was).focus({ preventScroll: true });
    },
  });
  const show = (name) => book.show(name);

  list.addEventListener('click', (e) => { const b = e.target.closest('.tt-row'); if (b && !b.disabled) show(b.dataset.page); });
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('.tt-row'); if (b && !b.disabled && !b.contains(e.relatedTarget)) sounds.hover(); });
  $('tt-ver').addEventListener('click', () => show('changes'));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') return show(null);
    if (b.dataset.act === 'new') { b.disabled = true; onNewTown(); return; }
    if (b.dataset.act === 'pass') {
      const p = PASSES.find((x) => x.id === b.dataset.v), note = $('ps-note');
      note.innerHTML = `<span class="ps-note-ico">${ICONS[p.icon]}</span><span><b class="h-disp">Not quite yet!</b>${p.note}</span><button class="nb-chip" type="button" data-act="pass-ok">Back to my town</button>`;
      note.style.setProperty('--pc', p.color);
      note.hidden = false;
      sounds.open('pass');
      return;
    }
    if (b.dataset.act === 'pass-ok') { $('ps-note').hidden = true; return; }
    const group = b.parentElement.dataset.k;
    if (group === 'filter') { filter = b.dataset.v; for (const c of b.parentElement.children) c.setAttribute('aria-pressed', String(c === b)); $('cl-list').innerHTML = changeList(); return; }
    if (group === 'emblem' || group === 'color') { stores.profile.set(group, b.dataset.v); book.refresh(); return; }
    if (group === 'preset') stores.quality.choose(b.dataset.v);
    if (group === 'sound') stores.sound.set('muted', b.dataset.v === 'off');
    if (group) book.refresh();
  });
  body.addEventListener('input', (e) => {
    if (e.target.id !== 'pf-name') return;
    stores.profile.set('name', e.target.value);
    const p = stores.profile.get();
    $('pf-avatar').innerHTML = avatar(p);
    const init = body.querySelector('.pf-emblem[data-v="initials"] .pf-init');
    if (init) init.textContent = initials(p.name) || 'AB';
  });
  body.addEventListener('change', (e) => { if (e.target.dataset.k === 'master') stores.sound.set('master', Number(e.target.value) / 100); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Escape' && book.isOpen()) { e.preventDefault(); book.close(); } });

  play.addEventListener('click', () => { if (ready) { writeSeen(VERSION); onPlay(); } });

  return {
    // What the save holds, once it is read: the line under Play, and whether this is a brand-new mayor.
    saveInfo(source, savedAgo) {
      isNew = source === 'new';
      // A town saved before this screen kept track counts as having seen the release before this one.
      if (!isNew && !seen && CHANGELOG[1]) { fresh = newSince(CHANGELOG[1].v); markFresh(); }
      $('tt-save').textContent = isNew ? 'A small village by the river is waiting for someone to look after it.' : saveLine(source, savedAgo);
      rowEl('new').hidden = isNew;
      title.classList.toggle('first-visit', isNew);
      if (isNew) {
        $('tt-eyebrow').textContent = 'Welcome';
        $('tt-await').textContent = 'Hello, new mayor';
        rowEl('howto').classList.add('glow');
        rowEl('howto').querySelector('small').textContent = 'start here: five small steps';
      }
    },
    // The loaded town, for the profile's badges.
    town(state) { town = state; },
    // The town at a glance, under the save line: { pop, coins, date }.
    townInfo(snap) {
      if (isNew || !snap) return;
      const items = [['people', fmt(snap.pop), 'residents'], ['coins', fmt(snap.coins), 'coins'], ['date', snap.date, '']];
      $('tt-snap').innerHTML = items.map(([id, v, unit]) => `<li class="tt-snap-${id}"><i aria-hidden="true"></i><b>${esc(v)}</b>${unit ? ' ' + unit : ''}</li>`).join('');
      $('tt-snap').hidden = false;
    },
    // While the town warms up: the Play button waits, with a slim bar under it.
    warm(fraction) {
      const pct = Math.round(fraction * 100);
      $('tt-warmbar').style.width = pct + '%';
      $('tt-warm').setAttribute('aria-valuenow', String(pct));
    },
    ready(s) {
      stores = s; ready = true;
      play.disabled = false; $('tt-playlabel').textContent = isNew ? 'Start my town' : 'Play';
      $('tt-warm').classList.add('ready');
      for (const r of ROWS) if (r.needsReady) rowEl(r.id).disabled = false;
      if (!book.isOpen()) play.focus({ preventScroll: true });
    },
    failed(message) { $('tt-playlabel').textContent = 'Cannot start'; $('tt-save').textContent = message; $('tt-warm').classList.add('ready'); },
    hideTitle() { book.close(); title.hidden = true; setTimeout(() => sounds.dispose(), 1500); },
    // 0..1: how much of the paper curtain covers the town (it hides the cuts between camera shots).
    curtain(v) { $('tt-curtain').style.opacity = String(v); },
    showBoot(steps) {
      $('bt-steps').innerHTML = steps.map((s) => `<li data-id="${s.id}" data-s="todo">${esc(s.caption)}</li>`).join('');
      boot.hidden = false;
    },
    // Called every frame while the progress screen is up: `shown` is the smoothed bar, `progress` the tracker.
    bootFrame(shown, progress) {
      const pct = Math.round(shown * 100);
      $('bt-fill').style.width = pct + '%';
      $('bt-house').style.left = pct + '%';
      $('bt-track').setAttribute('aria-valuenow', String(pct));
      $('bt-cap').textContent = progress.caption() + (progress.isDone() ? '' : '…');
      for (const s of progress.steps()) { const li = $('bt-steps').querySelector('[data-id="' + s.id + '"]'); if (li && li.dataset.s !== s.state) li.dataset.s = s.state; }
    },
    hideBoot() { boot.hidden = true; },
  };
}
