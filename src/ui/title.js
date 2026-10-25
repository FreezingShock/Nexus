// The title screen and the progress screen (markup is in index.html, styles in css/title.css). This file only drives
// them: main.js feeds it the load progress and the town's snapshot, and is told when Play or New town is chosen.
// The left card holds Play and the menu rows; a row opens its page as a big notebook sheet in the middle of the screen,
// which flips open from its spine (data-mo="flip" in css/motion.css) with a paper rustle and the page's own chime.
import { $, fmt } from './format.js';
import { VERSION } from '../version.js';
import { CHANGELOG, KINDS, newSince, kindCounts } from '../changelog.js';
import { CREDITS, saveLine, tipOfTheDay } from '../core/boot.js';
import { createPageSounds } from '../audio/page-sounds.js';
import { ICONS, KIND_ICONS, STEP_ICONS } from './title-icons.js';

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
  { id: 'settings', label: 'Settings', sub: 'graphics and sound', c: '#DCE8EC', gap: true, needsReady: true },
  { id: 'new', label: 'New town', sub: 'start over, keeping a backup', c: '#E9DCC4', needsReady: true },
];

// Every page's header: title, the line under it, and its accent colour.
export const PAGES = {
  howto: { title: 'How to play', sub: 'Five small steps, then the town is yours', c: '#A8C179' },
  changes: { title: 'Changes', sub: 'Every version of Nexus, newest first', c: '#E6BC62' },
  credits: { title: 'Credits', sub: 'Who made Nexus, and with what', c: '#E3A08E' },
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

// The version badge colours, cycled down the changelog.
const VERSION_COLORS = ['#B8472E', '#5F7A3E', '#C08A2E', '#35566A', '#97553E', '#7A5C86'];

export function createTitle({ onPlay, onNewTown }) {
  const title = $('title'), boot = $('boot'), play = $('tt-play'), list = $('tt-list');
  const sheet = $('tt-sheet'), scrim = $('tt-scrim'), body = $('tt-sheet-body');
  let ready = false, open = null, stores = null, isNew = false, filter = 'all';
  const seen = readSeen();
  let fresh = newSince(seen);
  const sounds = createPageSounds({ getSettings: () => (stores ? stores.sound.get() : null) });

  $('tt-ver').textContent = 'v' + VERSION;
  $('tt-tip').innerHTML = '<b>Tip</b> ' + esc(tipOfTheDay(new Date()));
  $('tt-back').querySelector('.tt-back-ico').innerHTML = ICONS.back;

  // ---- the rows
  list.innerHTML = ROWS.map((r) => `${r.gap ? '<hr class="tt-gap">' : ''}<button class="tt-row" id="tt-${r.id}" type="button" data-page="${r.id}" aria-haspopup="dialog"${r.needsReady ? ' disabled' : ''}>
      <span class="tt-ico" style="--c:${r.c}">${ICONS[r.id]}</span><span class="tt-rowtext"><b>${r.label}</b><small>${r.sub}</small></span>
      </button>`).join('');
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
      <h3 class="tt-h3 h-disp">Handy keys</h3>
      <ul class="ht-keys">${KEYS.map(([key, name]) => `<li>${k(key)}<span>${name}</span></li>`).join('')}</ul>
      <p class="tt-promise">Nothing here ever punishes you. Your town saves itself every 45 seconds. Take your time.</p>`,
    changes: () => {
      const total = CHANGELOG.reduce((n, e) => n + e.items.length, 0);
      const chips = [['all', 'Everything', '#FBF6EA'], ...Object.entries(KINDS).map(([id, kd]) => [id, kd.label, kd.color])];
      return `<div class="cl-top">
          <p class="cl-stats"><b>${CHANGELOG.length}</b> versions · <b>${total}</b> changes since ${fmtDate(CHANGELOG.at(-1).date)}</p>
          <div class="tt-chips cl-filter" data-k="filter">${chips.map(([id, label, c]) => `<button class="tt-chip" type="button" data-v="${id}" style="--c:${c}" aria-pressed="${filter === id}">${id === 'all' ? '' : `<i>${KIND_ICONS[id]}</i>`}${label}</button>`).join('')}</div>
        </div>
        <ol class="cl-list" id="cl-list">${changeList()}</ol>`;
    },
    credits: () => `<div class="cr-grid">${CREDITS.map((c, i) => `<section class="cr-card" style="--i:${i}"><h3 class="tt-eyebrow">${esc(c.head)}</h3>${c.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('')}</div>
      <p class="tt-promise">Thank you for playing. Every town is a little different, and yours is the only one like it.</p>`,
    settings: () => {
      const q = stores.quality.get(), s = stores.sound.get();
      return `<h3 class="tt-h3 h-disp">Graphics</h3>
        <div class="st-cards" data-k="preset">${PRESETS.map((p) => `<button class="st-card" type="button" data-v="${p.id}" aria-pressed="${q.preset === p.id}"><b>${p.name}</b><small>${p.text}</small></button>`).join('')}</div>
        <h3 class="tt-h3 h-disp">Sound</h3>
        <div class="st-row"><span><b>Sound</b><small>Music and the sounds of the town start once you press Play.</small></span>
          <div class="tt-chips" data-k="sound"><button class="tt-chip" type="button" data-v="on" aria-pressed="${!s.muted}">On</button><button class="tt-chip" type="button" data-v="off" aria-pressed="${s.muted}">Muted</button></div></div>
        <label class="st-row"><span><b>Volume</b><small>Everything at once. The rest wait in the town, under the menu.</small></span>
          <input type="range" min="0" max="100" step="5" value="${Math.round(s.master * 100)}" data-k="master" aria-label="Volume"></label>
        <p class="tt-promise">Seasons, weather, saves and more wait in the town, under the menu.</p>`;
    },
    new: () => `<p>You begin again with the small starter village. Your current town moves to the backup slot, and Settings in the town can bring it back.</p>
        <div class="tt-row-btns"><button class="btn" type="button" data-act="cancel">Keep my town</button><button class="btn primary" type="button" data-act="new">Start fresh</button></div>`,
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

  function show(name) {
    if (open === name) name = null;
    const was = open;
    open = name;
    for (const r of ROWS) rowEl(r.id).setAttribute('aria-expanded', String(r.id === name));
    if (!name) {
      sheet.hidden = true; scrim.hidden = true;
      if (was) { sounds.close(); rowEl(was).focus({ preventScroll: true }); }
      return; // the old page stays while it folds away
    }
    const p = PAGES[name];
    sheet.style.setProperty('--pg', p.c);
    sheet.classList.toggle('narrow', !!p.narrow);
    sheet.dataset.page = name;
    $('tt-sheet-ico').innerHTML = ICONS[name];
    $('tt-sheet-title').textContent = p.title;
    $('tt-sheet-sub').textContent = p.sub;
    body.innerHTML = pages[name]();
    body.scrollTop = 0;
    if (name === 'changes') { writeSeen(VERSION); const bd = rowEl('changes').querySelector('.tt-badge'); if (bd) bd.remove(); }
    scrim.hidden = false; sheet.hidden = false;
    sounds.open(name);
    $('tt-back').focus({ preventScroll: true });
  }

  list.addEventListener('click', (e) => { const b = e.target.closest('.tt-row'); if (b && !b.disabled) show(b.dataset.page); });
  list.addEventListener('pointerover', (e) => { const b = e.target.closest('.tt-row'); if (b && !b.disabled && !b.contains(e.relatedTarget)) sounds.hover(); });
  $('tt-ver').addEventListener('click', () => show('changes'));
  $('tt-back').addEventListener('click', () => show(null));
  scrim.addEventListener('click', () => show(null));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'cancel') return show(null);
    if (b.dataset.act === 'new') { b.disabled = true; onNewTown(); return; }
    const group = b.parentElement.dataset.k;
    if (group === 'filter') { filter = b.dataset.v; for (const c of b.parentElement.children) c.setAttribute('aria-pressed', String(c === b)); $('cl-list').innerHTML = changeList(); return; }
    if (group === 'preset') stores.quality.choose(b.dataset.v);
    if (group === 'sound') stores.sound.set('muted', b.dataset.v === 'off');
    if (group) { const top = body.scrollTop; body.innerHTML = pages.settings(); body.scrollTop = top; }
  });
  body.addEventListener('change', (e) => { if (e.target.dataset.k === 'master') stores.sound.set('master', Number(e.target.value) / 100); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.preventDefault(); show(null); } });

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
      if (!open) play.focus({ preventScroll: true });
    },
    failed(message) { $('tt-playlabel').textContent = 'Cannot start'; $('tt-save').textContent = message; $('tt-warm').classList.add('ready'); },
    hideTitle() { if (open) show(null); title.hidden = true; setTimeout(() => sounds.dispose(), 1500); },
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
