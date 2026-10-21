// First-time tips: a small note above the hint bar that asks for one thing at a time. Reads the player's counters only.
import { $ } from '../format.js';
import { TIP_STEPS, activeTip, loadSeen, saveSeen } from '../tips.js';

const PRAISE_MS = 2200, CHECK_S = 0.5;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export default {
  id: 'onboarding',
  create({ sim, send }) {
    const storage = (() => { try { return localStorage; } catch { return null; } })();
    const store = {
      get: () => (storage ? loadSeen(storage) : []),
      set: (ids) => { if (storage) saveSeen(storage, ids); },
    };
    let seen = store.get();
    let cur = null, praise = '', praiseUntil = 0, acc = CHECK_S;

    const box = el('aside', 'tipnote card');
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    $('app').appendChild(box);

    function render(step) {
      box.replaceChildren();
      if (!step) { box.hidden = true; return; }
      const n = TIP_STEPS.indexOf(step) + 1;
      box.append(el('p', 'tn-kick', 'Tip ' + n + ' of ' + TIP_STEPS.length));
      if (praise) box.append(el('p', 'tn-text tn-praise', praise));
      box.append(el('p', 'tn-text', step.text));
      const row = el('div', 'row');
      const ok = el('button', 'btn primary', 'Got it');
      ok.onclick = () => dismiss(step);
      const hide = el('button', 'linkbtn', 'Hide all tips');
      hide.onclick = () => { seen = TIP_STEPS.map((s) => s.id); store.set(seen); cur = null; render(null); };
      row.append(ok, hide);
      box.append(row);
      box.hidden = false;
    }

    function markSeen(id) {
      if (!seen.includes(id)) { seen = [...seen, id]; store.set(seen); }
    }

    function dismiss(step) {
      markSeen(step.id);
      cur = null; praise = '';
      check(true);
    }

    // Decides what the note says. Runs at 2 Hz and after a tip is answered; the DOM changes only when the step changes.
    function check(force = false) {
      const st = sim.state.stats || {};
      if (cur && cur.done(st)) {
        markSeen(cur.id);
        praise = cur.praise || '';
        praiseUntil = performance.now() + PRAISE_MS;
        cur = null;
        force = true;
      }
      const praising = praiseUntil && performance.now() < praiseUntil;
      if (!praising && praiseUntil) { praiseUntil = 0; praise = ''; force = true; }
      if (sim.state.offline) { // the postcard is on screen: keep the note quiet
        if (!box.hidden) box.hidden = true;
        return;
      }
      const next = activeTip(st, seen);
      if (force || next !== cur) {
        cur = next;
        render(cur);
      }
    }

    // A player who wants the tips back gets them from the shortcut sheet.
    addEventListener('nexus:tips-reset', () => { seen = []; store.set(seen); cur = null; check(true); });

    check(true);
    return {
      frame(dt) {
        acc += dt;
        if (acc < CHECK_S) return;
        acc = 0;
        check();
      },
    };
  },
};
