// Postcard notes: a small cream card that drops in under the header for milestones, Renewal and boosts.
// Click to put it away; otherwise it fades after a few seconds. Up to three at once.
import { $ } from '../format.js';
import { NOTE_ICONS, noteFor } from '../notes.js';

const LIFE_MS = 6500, MAX = 3, TILTS = [-1.2, 0.8, -0.5];

function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('width', '26');
  s.setAttribute('height', '26');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', NOTE_ICONS[name]);
  p.setAttribute('fill', '#E6BC62');
  p.setAttribute('stroke', '#2B2620');
  p.setAttribute('stroke-width', '1.8');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}

export default {
  id: 'notes',
  create() {
    const stack = document.createElement('div');
    stack.id = 'notes';
    stack.className = 'notes';
    stack.setAttribute('aria-live', 'polite');
    $('app').appendChild(stack);
    let n = 0;

    function put(c) {
      c.classList.add('out');
      setTimeout(() => c.remove(), 260);
    }

    function push(note) {
      const c = document.createElement('article');
      c.className = 'note';
      c.style.setProperty('--tilt', TILTS[n++ % TILTS.length] + 'deg');
      const stamp = document.createElement('span');
      stamp.className = 'note-stamp';
      stamp.append(icon(note.icon));
      const h = document.createElement('h3');
      h.className = 'note-title';
      h.textContent = note.title;
      const p = document.createElement('p');
      p.className = 'note-text';
      p.textContent = note.text;
      c.append(stamp, h, p);
      c.onclick = () => put(c);
      stack.append(c);
      while (stack.children.length > MAX) stack.firstElementChild.remove();
      setTimeout(() => { if (c.isConnected) put(c); }, LIFE_MS);
    }

    return {
      onEvent(e) {
        const note = noteFor(e);
        if (note) push(note);
      },
    };
  },
};
