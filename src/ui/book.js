// The town's notebook pages: Goals, Milestones, Sky and time, Paint town, Shortcuts and Settings open as one big sheet in
// the middle of the screen, the same sheet as the title screen's pages (src/ui/notebook.js), with a paper rustle and a
// chime of their own. The town keeps running behind a soft dim; nothing in the sim changes because a page is open.
// Modules register their page once, then open, toggle or close it by name. The sheet is built on the first open.
// One page at a time; opening one closes whatever else is in the top-right corner (slot.js).
import { createNotebook, notebookMarkup } from './notebook.js';
import { createPageSounds } from '../audio/page-sounds.js';
import { topRight } from './slot.js';

const pages = {};
const watchers = new Set();
let nb = null, soundStore = null, sounds = null;

function make() {
  const stage = document.createElement('div');
  stage.className = 'nb-stage';
  stage.id = 'pages';
  stage.innerHTML = notebookMarkup('pg');
  (document.getElementById('app') || document.body).appendChild(stage);
  sounds = createPageSounds({ getSettings: () => (soundStore ? soundStore.get() : null) });
  nb = createNotebook({
    get: (id) => document.getElementById(id), prefix: 'pg', pages, sounds,
    onShow(name, was) { if (!was) topRight.claim('book'); for (const w of watchers) w(name); },
    onHide() { for (const w of watchers) w(null); },
  });
  return nb;
}
const get = () => nb || make();

export const book = {
  // The sound settings store, so the page sounds follow mute and the effects volume. ui.js sets it.
  useSound(store) { soundStore = store; },
  register(id, page) { pages[id] = page; },
  open(id) { if (get().current() !== id) nb.show(id); },
  toggle(id) { get().show(id); },
  close() { if (nb) nb.close(); },
  isOpen: () => !!nb && nb.isOpen(),
  current: () => (nb ? nb.current() : null),
  tab: () => (nb ? nb.tab() : null),
  pickTab(id) { if (nb) nb.pickTab(id); },
  refresh() { if (nb) nb.refresh(); },
  setSub(text) { if (nb) nb.setSub(text); },
  body: () => get().body,
  hover() { if (sounds) sounds.hover(); },
  // fn(name) on every open (name) and close (null): the menu marks the tile of the open page.
  watch(fn) { watchers.add(fn); return () => watchers.delete(fn); },
};

topRight.register('book', { isOpen: () => book.isOpen(), close: () => book.close(), el: null });
