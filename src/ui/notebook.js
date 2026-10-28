// The notebook page: one big centred sheet that flips open from its spine (data-mo="flip" in css/motion.css) over a soft
// scrim, with a stamped icon, a title, a line under it, Back (Esc) and, when a page has them, coloured bookmark tabs on
// its right edge. The title screen and the town both use it (title.js and book.js); styles live in css/notebook.css.
// It only shows and hides pages: each page brings its own body markup and handlers.
//
// A page: { title, sub, c (accent colour), icon (svg), narrow?, compact?, tabs?: [{ id, label, color, icon }],
//   render(ctx) -> html (ctx: { tab, body }), opened?(ctx), closed?(), click?(e, ctx), input?(e, ctx), change?(e, ctx) }
// sub may be a function of the page, for a line that changes.
import { ICONS } from './title-icons.js';

// The markup of a sheet, for a host that builds it in script (the town). The title screen writes the same shape in index.html.
export function notebookMarkup(p) {
  return `<i class="nb-scrim" id="${p}-scrim" data-mo="fade" hidden></i>
    <article class="nb-sheet card" id="${p}-sheet" data-mo="flip" role="dialog" aria-modal="true" aria-labelledby="${p}-sheet-title" hidden>
      <span class="tape nb-tape nb-tape-l" aria-hidden="true"></span><span class="tape nb-tape nb-tape-r" aria-hidden="true"></span>
      <nav class="nb-tabs" id="${p}-tabs" role="tablist" aria-label="Sections" hidden></nav>
      <header class="nb-head">
        <button class="nb-back" id="${p}-back" type="button"><span class="nb-back-ico"></span>Back <kbd>Esc</kbd></button>
        <span class="nb-ico" id="${p}-sheet-ico"></span>
        <span class="nb-titles"><h2 class="h-disp" id="${p}-sheet-title"></h2><small class="nb-sub" id="${p}-sheet-sub"></small></span>
      </header>
      <div class="nb-body" id="${p}-sheet-body"></div>
    </article>`;
}

// The tab strip's buttons. Exported for the tests.
export function tabsMarkup(tabs, current) {
  return tabs.map((t, i) => `<button class="nb-tab" type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === current}" style="--tc:${t.color};--i:${i}">${t.icon || ''}<span>${t.label}</span></button>`).join('');
}

// get(id): the element with that id. prefix: the ids' prefix ('tt' on the title, 'pg' in the town).
// sounds: { open(name), close() } or null. onShow(name) and onHide(name) tell the host.
export function createNotebook({ get, prefix, pages, sounds = null, onShow = () => {}, onHide = () => {} }) {
  const el = (s) => get(prefix + '-' + s);
  const sheet = el('sheet'), scrim = el('scrim'), body = el('sheet-body'), tabsEl = el('tabs');
  let open = null;
  const tabOf = {}; // the tab each page was left on, kept while the game runs
  const backIco = sheet.querySelector('.nb-back-ico');
  if (backIco) backIco.innerHTML = ICONS.back;

  const ctx = () => ({ tab: open ? tabOf[open] : null, body, page: open });
  const subOf = (p) => (typeof p.sub === 'function' ? p.sub() : p.sub);

  // keepScroll: a redraw of the page already open, after a choice. It keeps its place and does not rise in again.
  function paint(keepScroll = false) {
    const p = pages[open], top = body.scrollTop;
    body.classList.toggle('nb-still', keepScroll);
    body.innerHTML = p.render(ctx());
    body.scrollTop = keepScroll ? top : 0;
    if (p.opened) p.opened(ctx());
  }
  function paintTabs(p) {
    const has = !!(p.tabs && p.tabs.length);
    sheet.classList.toggle('has-tabs', has);
    if (!tabsEl) return;
    tabsEl.hidden = !has;
    tabsEl.innerHTML = has ? tabsMarkup(p.tabs, tabOf[open]) : '';
  }

  function show(name) {
    if (name === open || !name) return close();
    const was = open, p = pages[name];
    if (!p) return;
    if (was && pages[was].closed) pages[was].closed();
    open = name;
    if (p.tabs && !p.tabs.some((t) => t.id === tabOf[name])) tabOf[name] = p.tabs[0].id;
    sheet.style.setProperty('--pg', p.c);
    sheet.classList.toggle('narrow', !!p.narrow);
    sheet.classList.toggle('compact', !!p.compact);
    sheet.dataset.page = name;
    el('sheet-ico').innerHTML = p.icon || '';
    el('sheet-title').textContent = p.title;
    el('sheet-sub').textContent = subOf(p);
    paintTabs(p);
    sheet.style.setProperty('--tab', p.tabs ? p.tabs.find((t) => t.id === tabOf[name]).color : '');
    paint();
    scrim.hidden = false; sheet.hidden = false;
    if (sounds) sounds.open(name);
    if (!was) el('back').focus({ preventScroll: true });
    onShow(name, was);
  }
  function close() {
    if (!open) return;
    const was = open;
    open = null;
    if (pages[was].closed) pages[was].closed();
    sheet.hidden = true; scrim.hidden = true; // the old page stays while it folds away
    if (sounds) sounds.close();
    onHide(was);
  }
  function pickTab(id) {
    const p = pages[open];
    if (!p || !p.tabs || !p.tabs.some((t) => t.id === id) || tabOf[open] === id) return;
    tabOf[open] = id;
    for (const b of tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    sheet.style.setProperty('--tab', (p.tabs.find((t) => t.id === id) || {}).color || '');
    paint();
  }

  el('back').addEventListener('click', close);
  scrim.addEventListener('click', close);
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => { const b = e.target.closest('.nb-tab'); if (b) pickTab(b.dataset.tab); });
    tabsEl.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      const tabs = open && pages[open].tabs;
      if (!d || !tabs) return;
      e.preventDefault();
      const i = tabs.findIndex((t) => t.id === tabOf[open]), next = tabs[(i + d + tabs.length) % tabs.length].id;
      pickTab(next);
      tabsEl.querySelector(`[data-tab="${next}"]`).focus();
    });
  }
  for (const kind of ['click', 'input', 'change']) {
    body.addEventListener(kind, (e) => { const p = open && pages[open]; if (p && p[kind]) p[kind](e, ctx()); });
  }

  return {
    show, close, pickTab,
    toggle: (name) => show(name),
    isOpen: () => open !== null,
    current: () => open,
    tab: () => (open ? tabOf[open] : null),
    body,
    // Draw the open page again, keeping its scroll (after a choice that changes what it shows).
    refresh() { if (open) { el('sheet-sub').textContent = subOf(pages[open]); paint(true); } },
    // Only the line under the title, for a page whose numbers move.
    setSub(text) { const s = el('sheet-sub'); if (s.textContent !== text) s.textContent = text; },
  };
}
