// The town Paint menu: pick a wall scheme, a trim colour and a roof colour, see a cottage and a mansard block dressed in
// them, and paint every building in the town (and every grown lot) in one go. The price is per building. Locked colours show
// their Parts price and open for good with one click. Ctrl+Z takes a whole-town paint back. Sends paintTown, clearTownPaint
// and unlockPaint; reads the sim and sends nothing else. Rules and prices live in src/world/paint.js.
import { costOf, isOpen, partsOf, tableOf } from '../../world/paint.js';
import { $, fmt } from '../format.js';
import { topRight } from '../slot.js';
import { thumbFor } from '../../render/thumbs.js';
import { esc } from '../cards.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';
const BUTTON_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#2B2620" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 4h11a2 2 0 0 1 2 2v3H5z" fill="#E6BC62"/><path d="M18 7.5h2v5h-8V15" /><rect x="10.5" y="15" width="3" height="6" rx="1" fill="#C96F4F"/></svg>';
const ROWS = [['wall', 'Walls', 'Each scheme brings its own trim'], ['trim', 'Trim', 'Doors, window frames and porches'], ['roof', 'Roof', 'Every roof in town']];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const SAMPLES = ['cottage', 'mansard'];

export default {
  id: 'paint-town',
  create({ sim, send }) {
    const s = sim.state;
    let open = false, dirty = true, acc = 0, sig = '';
    const draft = { wall: null, trim: null, roof: null }; // what the next Apply would paint; null keeps what is there

    const btn = document.createElement('button');
    btn.className = 'ib'; btn.id = 'paintbtn';
    btn.setAttribute('aria-label', 'Paint the town'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = BUTTON_SVG;
    ($('goalsbtn') || $('settingsbtn')).before(btn);

    const card = document.createElement('aside');
    card.id = 'paintcard'; card.className = 'card'; card.dataset.mo = ''; card.hidden = true;
    card.setAttribute('aria-label', 'Paint the town');
    $('app').appendChild(card);

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
      const pics = SAMPLES.map((m) => { const url = thumbFor(m, 3, c); return url ? `<img src="${url}" alt="" width="96" height="72" decoding="async">` : '<span class="pic-ph"></span>'; }).join('');
      const rows = ROWS.map(([k, name, sub]) => `<div class="ph"><b>${name}</b><small>${esc(sub)}</small></div><div class="swrow">` +
        `<button type="button" class="sw keep" data-k="${k}" data-key="" aria-pressed="${!draft[k]}" title="Keep what is there" aria-label="Keep what is there">·</button>` +
        Object.keys(partsOf(k)).map((key) => swatch(k, key)).join('') + '</div>').join('');
      const poor = plan.cost > s.coins;
      const line = !any ? 'Pick a colour to see it on the town' : plan.n ? `${plan.n} building${plan.n === 1 ? '' : 's'} · ₵ ${fmt(plan.cost)}` : 'The whole town already wears that';
      card.innerHTML = `<button class="x" id="pcx" type="button" aria-label="Close">${CLOSE_SVG}</button>
        <div class="band"><h2 class="h-disp">Paint the town</h2><div class="sub">One brush for every wall and roof</div></div>
        <div class="pbody"><div class="pprev">${pics}</div>${rows}
        <div class="pgo"><span class="pline${poor ? ' poor' : ''}">${line}${poor ? ' · need ₵ ' + fmt(plan.cost - s.coins) + ' more' : ''}</span>
        <button type="button" class="btn primary" id="pgo" ${plan.n && !poor ? '' : 'disabled'}>Paint the town</button></div>
        <button type="button" class="linkbtn" id="pclear" ${s.townPaint ? '' : 'hidden'}>Grown lots back to district colours</button></div>`;
      sig = stateSig();
    }
    const stateSig = () => JSON.stringify([draft, s.paintUnlocks, s.townPaint, s.placed.length, s.lots.length, s.coins >= sim.townPlan(change()).cost]);

    card.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#pcx')) { setOpen(false); return; }
      if (t.closest('#pclear')) { send({ type: 'clearTownPaint' }); dirty = true; return; }
      if (t.closest('#pgo')) { send({ type: 'paintTown', ...change() }); draft.wall = draft.trim = draft.roof = null; dirty = true; return; }
      const sw = t.closest('.sw');
      if (!sw) return;
      const kind = sw.dataset.k, key = sw.dataset.key;
      if (!key) draft[kind] = null;
      else if (!isOpen(kind, key, s.paintUnlocks)) { send({ type: 'unlockPaint', kind, key }); if (isOpen(kind, key, s.paintUnlocks)) draft[kind] = key; }
      else draft[kind] = draft[kind] === key ? null : key;
      dirty = true;
    });

    function setOpen(on) {
      if (on) topRight.claim('paint');
      open = on; card.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) { dirty = true; }
    }
    topRight.register('paint', { isOpen: () => open, close: () => setOpen(false), el: card });
    btn.addEventListener('click', () => setOpen(!open));

    return {
      onKey(e) { if (open && e.key === 'Escape') { setOpen(false); return true; } return false; },
      frame(dt) {
        if (!open) return;
        acc += dt;
        if (acc > 0.5) { acc = 0; if (stateSig() !== sig) dirty = true; }
        if (dirty) { dirty = false; const top = card.querySelector('.pbody'); const at = top ? top.scrollTop : 0; render(); const nb = card.querySelector('.pbody'); if (nb) nb.scrollTop = at; }
      },
    };
  },
};
