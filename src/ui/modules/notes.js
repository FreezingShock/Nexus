// Notifications: slim paper strips that slide down under the header, newest on top, up to three at once.
// Plain toasts become a one-line notice with a coloured icon; milestones, goals and the town's little events become a
// reward strip with a title, a line saying what happened, and coin and Parts chips. Those chips burst into the HUD
// counters a beat after the strip lands, the same flight as the postcard's takings (collect-fx.js).
// Hover holds a strip; click puts it away. A notice that repeats while showing counts up (×2) instead of stacking.
// Strips tween in and out with the shared data-mo motion (css/motion.css); their row then folds shut so the rest glide up.
import { $ } from '../format.js';
import { NOTE_ICONS, noteFor, toastNote, chipAmount } from '../notes.js';
import { burst } from '../collect-fx.js';
import { playCue } from '../../audio/cuehub.js';

const MAX = 3, BURST_AFTER = 520;
const SVG = 'http://www.w3.org/2000/svg';

function glyph(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', NOTE_ICONS[name] || NOTE_ICONS.info);
  p.setAttribute('fill', '#FFF8EE');
  p.setAttribute('stroke', '#2B2620');
  p.setAttribute('stroke-width', '1.9');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };

export default {
  id: 'notes',
  create({ hud }) {
    const stack = el('div', 'notes');
    stack.id = 'notes';
    stack.setAttribute('aria-live', 'polite');
    $('app').appendChild(stack);
    // The coin and Parts icons are the HUD's own, so what flies is what you see in the counters.
    const RES_ICON = {};
    for (const key of ['coins', 'parts']) {
      const b = hud && hud.badgeOf(key), svg = b && b.querySelector('svg');
      RES_ICON[key] = svg ? svg.outerHTML : '';
    }
    const live = []; // { row, card, note, timer, left, since, count, gone }

    function leave(it) {
      if (it.gone) return;
      it.gone = true;
      clearTimeout(it.timer);
      const i = live.indexOf(it);
      if (i >= 0) live.splice(i, 1);
      it.card.hidden = true; // fades and sinks (data-mo), then the row folds shut
      setTimeout(() => { it.row.classList.remove('open'); }, 160);
      setTimeout(() => it.row.remove(), 520);
    }

    function arm(it, ms) {
      clearTimeout(it.timer);
      it.left = ms; it.since = performance.now();
      it.timer = setTimeout(() => leave(it), ms);
    }

    // Collect a reward: hold the amounts back from the counters now, and fly them in once the strip has landed.
    function collect(it, gains) {
      const kinds = ['coins', 'parts'].filter((key) => it.note[key] >= 1).map((key) => ({
        key, amount: it.note[key], target: hud.badgeOf(key), icon: RES_ICON[key],
        onLand: (share, last) => hud.land(key, share, last ? chipAmount(it.note[key]) : ''),
      }));
      if (!kinds.length) return;
      for (const k of kinds) hud.hold(k.key, k.amount);
      setTimeout(() => burst(gains, kinds), BURST_AFTER);
    }

    function build(note) {
      const card = el('article', 'nt' + (note.short ? ' short' : ''));
      card.dataset.kind = note.kind;
      card.dataset.mo = '';
      card.hidden = true;
      card.style.setProperty('--c', note.color);
      card.style.setProperty('--life', note.life + 'ms');
      const ico = el('span', 'nt-ico');
      ico.append(glyph(note.icon));
      const body = el('div', 'nt-body');
      if (note.title) body.append(el('b', 'nt-title', note.title));
      body.append(el('span', 'nt-text', note.text));
      card.append(ico, body);
      let gains = null;
      if (note.coins || note.parts || note.extra) {
        gains = el('div', 'nt-gains');
        for (const key of ['coins', 'parts']) {
          if (!note[key]) continue;
          const g = el('span', 'nt-gain ' + key);
          g.innerHTML = RES_ICON[key];
          g.append(el('b', '', chipAmount(note[key])));
          g.title = note[key].toLocaleString('en-US') + (key === 'coins' ? ' coins' : ' Parts');
          gains.append(g);
        }
        if (note.extra) gains.append(el('span', 'nt-gain extra', note.extra));
        card.append(gains);
      }
      card.append(el('i', 'nt-count'), el('i', 'nt-life'));
      return { card, gains };
    }

    function push(note) {
      // The same notice again while it shows: count it and give it a fresh few seconds instead of a second strip.
      const twin = note.short && live.find((o) => o.note.short && o.note.text === note.text);
      if (twin) {
        twin.count++;
        twin.card.querySelector('.nt-count').textContent = '×' + twin.count;
        twin.card.querySelector('.nt-life').replaceWith(el('i', 'nt-life')); // the time line starts over
        twin.card.classList.remove('bump'); void twin.card.offsetWidth; twin.card.classList.add('bump');
        arm(twin, note.life);
        return;
      }
      const { card, gains } = build(note);
      const row = el('div', 'nt-row');
      const clip = el('div', 'nt-clip');
      clip.append(card); row.append(clip);
      stack.prepend(row);
      const it = { row, card, note, count: 1, gone: false, timer: 0 };
      live.unshift(it);
      // Too many: the oldest plain notice makes way first, so a reward is never pushed off by a quick hint.
      while (live.length > MAX) leave([...live].reverse().find((o) => o.note.short) || live[live.length - 1]);
      requestAnimationFrame(() => requestAnimationFrame(() => { row.classList.add('open'); card.hidden = false; }));
      arm(it, note.life);
      card.onclick = () => leave(it);
      card.onmouseenter = () => { clearTimeout(it.timer); it.left = Math.max(900, it.left - (performance.now() - it.since)); card.classList.add('held'); };
      card.onmouseleave = () => { card.classList.remove('held'); if (!it.gone) arm(it, it.left); };
      if (gains && hud) collect(it, gains);
      if (note.kind !== 'warn') playCue('note');
    }

    // Every toast in the game comes here (hud.toast forwards), with an optional kind to colour it.
    if (hud && hud.useToasts) hud.useToasts((text, kind) => { if (text) push(toastNote(text, kind)); });

    return {
      onEvent(e) {
        const note = noteFor(e);
        if (note) push(note);
      },
    };
  },
};
