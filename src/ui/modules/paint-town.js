// The Paint the town page (a notebook page, src/ui/book.js): pick a wall scheme, a trim colour and a roof colour, see a
// cottage and a mansard block dressed in them, and paint every building in the town (and every grown lot) in one go. The price is per building. Locked colours show
// their Parts price and open for good with one click. Ctrl+Z takes a whole-town paint back. Sends paintTown, clearTownPaint
// and unlockPaint; reads the sim and sends nothing else. Rules and prices live in src/world/paint.js.
import { costOf, isOpen, partsOf, tableOf } from '../../world/paint.js';
import { $, fmt } from '../format.js';
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { thumbFor } from '../../render/thumbs.js';
import { esc } from '../cards.js';

const BUTTON_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#2B2620" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 4h11a2 2 0 0 1 2 2v3H5z" fill="#E6BC62"/><path d="M18 7.5h2v5h-8V15" /><rect x="10.5" y="15" width="3" height="6" rx="1" fill="#C96F4F"/></svg>';
const ROWS = [['wall', 'Walls', 'Each scheme brings its own trim'], ['trim', 'Trim', 'Doors, window frames and porches'], ['roof', 'Roof', 'Every roof in town']];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const SAMPLES = ['cottage', 'mansard'];
const SAMPLE_NAMES = ['A cottage', 'A mansard block'];

export default {
  id: 'paint-town',
  create({ sim, send }) {
    const s = sim.state;
    let dirty = true, acc = 0, sig = '';
    const draft = { wall: null, trim: null, roof: null }; // what the next Apply would paint; null keeps what is there

    const btn = document.createElement('button');
    btn.className = 'ib'; btn.id = 'paintbtn';
    btn.setAttribute('aria-label', 'Paint the town'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = BUTTON_SVG;
    ($('goalsbtn') || $('settingsbtn')).before(btn);

    const change = () => Object.fromEntries(Object.entries(draft).filter(([, v]) => v));
    const swatch = (kind, key) => {
      const e = tableOf(kind)[key], parts = partsOf(kind)[key], locked = !isOpen(kind, key, s.paintUnlocks);
      const color = kind === 'wall' ? e.wall : hex(e.hex), now = draft[kind] === key;
      const two = kind === 'wall' && e.two ? ' · two-tone' : '';
      const tip = locked ? `${e.name}${two} · ${parts} Parts opens it for good` : `${e.name}${two}`;
      const dot = kind === 'wall' ? `<i class="trim" style="background:${hex(e.accent)}"></i>` : '';
      return `<button type="button" class="sw${locked ? ' locked' : ''}" data-k="${kind}" data-key="${key}" aria-pressed="${now}" title="${esc(tip)}" aria-label="${esc(tip)}" style="--sw:${color}">${dot}${locked ? `<small>${parts}</small>` : ''}</button>`;
    };

    function render() {
      const c = change(), plan = sim.townPlan(c), any = plan.kinds.length > 0;
      const pics = SAMPLES.map((m, i) => { const url = thumbFor(m, 3, c); return `<figure class="pt-pic" style="--i:${i}">${url ? `<img src="${url}" alt="" width="192" height="144" decoding="async">` : '<span class="pic-ph"></span>'}<figcaption>${SAMPLE_NAMES[i]}</figcaption></figure>`; }).join('');
      const rows = ROWS.map(([k, name, sub]) => `<section class="pg-box pt-row"><h3 class="h-disp">${name} <small>${esc(sub)}</small></h3><div class="swrow">` +
        `<button type="button" class="sw keep" data-k="${k}" data-key="" aria-pressed="${!draft[k]}" title="Keep what is there" aria-label="Keep what is there">·</button>` +
        Object.keys(partsOf(k)).map((key) => swatch(k, key)).join('') + '</div></section>').join('');
      const poor = plan.cost > s.coins;
      const line = !any ? 'Pick a colour to see it on the town' : plan.n ? `${plan.n} building${plan.n === 1 ? '' : 's'} · ₵ ${fmt(plan.cost)}` : 'The whole town already wears that';
      sig = stateSig();
      return `<div class="pt-wrap">
        <div class="pt-prev"><div class="pt-pics">${pics}</div>
          <p class="pg-soft">Locked colours show their Parts price and open for good with one click. Ctrl+Z takes a whole-town paint back.</p>
          <button type="button" class="linkbtn" id="pclear" ${s.townPaint ? '' : 'hidden'}>Grown lots back to district colours</button></div>
        <div class="pt-rows">${rows}</div>
      </div>
      <div class="pt-go"><span class="pline${poor ? ' poor' : ''}">${line}${poor ? ' · need ₵ ' + fmt(plan.cost - s.coins) + ' more' : ''}</span>
        <button type="button" class="btn primary" id="pgo" ${plan.n && !poor ? '' : 'disabled'}>Paint the town</button></div>`;
    }
    const stateSig = () => JSON.stringify([draft, s.paintUnlocks, s.townPaint, s.placed.length, s.lots.length, s.coins >= sim.townPlan(change()).cost]);

    book.register('paint', {
      title: 'Paint the town', sub: 'One brush for every wall, trim and roof. The price is per building.', c: '#E6BC62', icon: PAGE_ICONS.paint,
      render,
      click(e) {
        const t = e.target;
        if (t.closest('#pclear')) { send({ type: 'clearTownPaint' }); dirty = true; return; }
        if (t.closest('#pgo')) { send({ type: 'paintTown', ...change() }); draft.wall = draft.trim = draft.roof = null; dirty = true; return; }
        const sw = t.closest('.sw');
        if (!sw) return;
        const kind = sw.dataset.k, key = sw.dataset.key;
        if (!key) draft[kind] = null;
        else if (!isOpen(kind, key, s.paintUnlocks)) { send({ type: 'unlockPaint', kind, key }); if (isOpen(kind, key, s.paintUnlocks)) draft[kind] = key; }
        else draft[kind] = draft[kind] === key ? null : key;
        dirty = true;
      },
    });
    btn.addEventListener('click', () => book.toggle('paint'));
    const open = () => book.current() === 'paint';

    return {
      frame(dt) {
        if (!open()) return;
        acc += dt;
        if (acc > 0.5) { acc = 0; if (stateSig() !== sig) dirty = true; }
        if (dirty) { dirty = false; book.refresh(); }
      },
    };
  },
};
