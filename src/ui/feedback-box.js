// The feedback box in the title screen's bottom-right corner: a small "Ideas & feedback" tab that unfolds into a paper
// note where players write a suggestion and send it to the author. Sending goes through src/core/feedback-send.js, which
// keeps the note for later when the player is offline. Styles in css/feedback-box.css.
import { AUTHOR } from '../version.js';
import { cleanNote, createOutbox, FEEDBACK_KINDS, LIMITS } from '../core/feedback-send.js';

const S = 'fill="none" stroke="#2B2620" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const KIND_INFO = {
  idea: { label: 'Idea', c: '#F2D27A', icon: `<svg viewBox="0 0 20 20" ${S}><path d="M10 2.5Q15.5 2.5 15.5 8Q15.5 10.5 13 12.5V14.5H7V12.5Q4.5 10.5 4.5 8Q4.5 2.5 10 2.5Z" fill="#F2D27A"/><path d="M7.5 17.5H12.5"/></svg>` },
  bug: { label: 'Bug', c: '#E3A08E', icon: `<svg viewBox="0 0 20 20" ${S}><path d="M4.5 11Q4.5 5.5 10 5.5Q15.5 5.5 15.5 11Q15.5 17 10 17Q4.5 17 4.5 11Z" fill="#D2603F"/><path d="M10 5.5V17M7 3L8.5 5M13 3L11.5 5"/><circle cx="7.5" cy="10" r="1" fill="#2B2620"/><circle cx="12.5" cy="13" r="1" fill="#2B2620"/></svg>` },
  other: { label: 'Hello', c: '#C9DDB8', icon: `<svg viewBox="0 0 20 20" ${S}><path d="M10 16.5Q2.5 12 2.5 7.5Q2.5 4 6 4Q8.5 4 10 6.5Q11.5 4 14 4Q17.5 4 17.5 7.5Q17.5 12 10 16.5Z" fill="#E8B9C5"/></svg>` },
};
const LETTER = `<svg viewBox="0 0 24 24" ${S}><rect x="2.5" y="5.5" width="19" height="13" rx="2" fill="#FBF6EA"/><path d="M3 6.5L12 13L21 6.5"/><circle cx="18.5" cy="6" r="3.3" fill="#B8472E" stroke-width="1.4"/></svg>`;

export function feedbackMarkup(author = AUTHOR) {
  return `<aside class="fb" id="fb" aria-label="Feedback">
  <form class="fb-card card" id="fb-card" data-mo="up" hidden novalidate>
    <span class="tape fb-tape" aria-hidden="true"></span>
    <button class="fb-x" id="fb-x" type="button" aria-label="Close">×</button>
    <div class="fb-write" id="fb-write">
      <h2 class="fb-title h-disp">A note for ${author}</h2>
      <p class="fb-sub">Ideas, wishes, things that broke. Every note gets read.</p>
      <div class="fb-kinds" role="radiogroup" aria-label="What kind of note">${FEEDBACK_KINDS.map((k, i) => `<label class="fb-kind" style="--c:${KIND_INFO[k].c}"><input type="radio" name="kind" value="${k}"${i === 0 ? ' checked' : ''}><span>${KIND_INFO[k].icon}${KIND_INFO[k].label}</span></label>`).join('')}</div>
      <label class="fb-field"><span class="fb-lab">Your note</span><textarea id="fb-msg" name="message" rows="5" maxlength="${LIMITS.message}" placeholder="What would make your town cozier?" required></textarea><small class="fb-count" id="fb-count">0 / ${LIMITS.message}</small></label>
      <label class="fb-field"><span class="fb-lab">Your name <i>(optional)</i></span><input id="fb-name" name="name" type="text" maxlength="${LIMITS.name}" autocomplete="nickname" placeholder="Mayor of somewhere"></label>
      <label class="fb-hp" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
      <div class="fb-foot"><p class="fb-status" id="fb-status" role="status" aria-live="polite"></p><button class="btn primary fb-send" id="fb-send" type="submit">${LETTER}<span>Send</span></button></div>
    </div>
    <div class="fb-done" id="fb-done" hidden>
      <span class="fb-stamp" aria-hidden="true">${LETTER}</span>
      <h2 class="fb-title h-disp" id="fb-done-title">Thank you!</h2>
      <p class="fb-sub" id="fb-done-text"></p>
      <button class="btn fb-again" id="fb-again" type="button">Write another</button>
    </div>
  </form>
  <button class="fb-tab" id="fb-tab" type="button" aria-expanded="false" aria-controls="fb-card">${LETTER}<span>Ideas &amp; feedback</span><i class="fb-dot" id="fb-dot" hidden></i></button>
</aside>`;
}

export function createFeedbackBox(host, { storage = safeStorage(), fetchFn = globalThis.fetch?.bind(globalThis), win = globalThis.window } = {}) {
  host.insertAdjacentHTML('beforeend', feedbackMarkup());
  const q = (id) => host.querySelector('#' + id);
  const card = q('fb-card'), tab = q('fb-tab'), msg = q('fb-msg'), status = q('fb-status'), send = q('fb-send');
  const outbox = createOutbox({ storage, fetchFn });
  const showDot = () => { q('fb-dot').hidden = outbox.pending() === 0; };

  function open(on) {
    card.hidden = !on;
    tab.setAttribute('aria-expanded', String(on));
    tab.classList.toggle('on', on);
    host.querySelector('#fb').classList.toggle('open', on);
    if (on) setTimeout(() => (q('fb-done').hidden ? msg : q('fb-again')).focus(), 60);
  }
  tab.addEventListener('click', () => open(card.hidden));
  q('fb-x').addEventListener('click', () => { open(false); tab.focus(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); open(false); tab.focus(); } });
  msg.addEventListener('input', () => { q('fb-count').textContent = `${msg.value.length} / ${LIMITS.message}`; status.textContent = ''; });

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (send.disabled) return;
    const form = new FormData(card);
    const c = cleanNote(Object.fromEntries(form));
    if (!c.ok) { status.textContent = 'Write a few words first.'; msg.focus(); return; }
    send.disabled = true;
    status.textContent = 'Folding it into an envelope…';
    const r = await outbox.send(c.note);
    send.disabled = false;
    showDot();
    if (r === 'busy') { status.textContent = 'Lots of notes just now. Try again in a few minutes.'; return; }
    if (r === 'rejected') { status.textContent = 'That note could not be sent. Try making it a little shorter.'; return; }
    status.textContent = '';
    q('fb-done-title').textContent = r === 'sent' ? 'Thank you!' : 'Saved for later';
    q('fb-done-text').textContent = r === 'sent'
      ? `Your note is on its way to ${AUTHOR}.`
      : 'You seem to be offline. The note is tucked away and will be sent next time you visit while online.';
    msg.value = ''; q('fb-count').textContent = `0 / ${LIMITS.message}`;
    q('fb-write').hidden = true; q('fb-done').hidden = false;
    q('fb-again').focus();
  });
  q('fb-again').addEventListener('click', () => { q('fb-done').hidden = true; q('fb-write').hidden = false; msg.focus(); });

  // Notes left from an offline visit go out quietly, never before the player has had the page for a moment.
  const retry = () => { outbox.flush().then(showDot, showDot); };
  showDot();
  if (outbox.pending()) {
    if (!win || win.navigator?.onLine !== false) setTimeout(retry, 4000);
  }
  win?.addEventListener?.('online', () => { if (outbox.pending()) retry(); });
  return { open, outbox };
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
