// Hover tips for the tool bar and the HUD. One floating bubble, shown after a short pause, mouse and keyboard focus only.
import { HOVER_TIPS } from '../hovers.js';
import { book } from '../book.js';

const DELAY = 350;

export default {
  id: 'tooltips',
  create() {
    const bubble = document.createElement('div');
    bubble.className = 'tipbubble';
    bubble.setAttribute('role', 'tooltip');
    bubble.dataset.mo = 'tag'; bubble.hidden = true;
    document.body.appendChild(bubble);

    let timer = 0, anchor = null;

    const find = (target) => {
      if (!target || !target.closest) return null;
      for (const [sel, text] of HOVER_TIPS) {
        const el = target.closest(sel);
        if (el) return { el, text };
      }
      return null;
    };

    function place(el) {
      const r = el.getBoundingClientRect();
      const w = bubble.offsetWidth, h = bubble.offsetHeight, m = 8;
      let x = r.left + r.width / 2 - w / 2;
      x = Math.max(m, Math.min(innerWidth - w - m, x));
      let y = r.top - h - 10;
      if (y < m) y = r.bottom + 10; // no room above: go below
      bubble.style.left = x + 'px';
      bubble.style.top = y + 'px';
    }

    function show(hit) {
      if (book.current() === 'shortcuts') return;
      anchor = hit.el;
      bubble.textContent = hit.text;
      bubble.hidden = false;
      place(hit.el);
    }

    function hide() {
      clearTimeout(timer);
      anchor = null;
      bubble.hidden = true;
    }

    addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const hit = find(e.target);
      clearTimeout(timer);
      if (!hit) { if (anchor) hide(); return; }
      if (hit.el === anchor) return;
      timer = setTimeout(() => show(hit), DELAY);
    });
    addEventListener('pointerout', (e) => {
      if (anchor && (!e.relatedTarget || !anchor.contains(e.relatedTarget))) hide();
    });
    addEventListener('pointerdown', hide);
    addEventListener('focusin', (e) => {
      const hit = find(e.target);
      if (hit && e.target.matches(':focus-visible')) show(hit);
    });
    addEventListener('focusout', hide);
    addEventListener('scroll', hide, true);
    addEventListener('resize', hide);
    return {};
  },
};
