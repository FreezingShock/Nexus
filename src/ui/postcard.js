// The offline return: an envelope that opens to a postcard. Numbers come from the closed-form catch-up.
import { $, fmt, fmtDuration, fmtPostmark } from './format.js';

const BASE_NOTES = [
  'Dear mayor, everything stayed cozy while you were away. The lamps are lit, the river is calm and the bakery is still warm.',
  'Dear mayor, the streets were quiet and the cars kept their slow, steady rounds. Come and see what grew.',
  'Dear mayor, a gentle breeze moved through the pines and every chimney stayed warm. We saved your seat.',
];

function note(log, night) {
  const last = log[log.length - 1];
  let m = BASE_NOTES[Math.floor(Math.random() * BASE_NOTES.length)];
  if (last) {
    const n = last.n.toLowerCase();
    if (last.k === 'up') m = 'Dear mayor, your ' + n + ' has been shining since the upgrade, and the neighbours keep stopping to look at it.';
    else if (last.k === 'road') m = 'Dear mayor, the new road is open and the first cars have already found it. Traffic has never felt so calm.';
    else if (last.k === 'doze') m = 'Dear mayor, the lot where the ' + n + ' stood is quiet now, and wildflowers are starting to come up.';
  }
  return night ? m + ' The lamps look lovely tonight.' : m;
}

function caption(night) {
  const h = new Date().getHours();
  if (night || h >= 21 || h < 5) return 'Our town tonight';
  if (h < 12) return 'Our town this morning';
  if (h < 17) return 'Our town this afternoon';
  return 'Our town this evening';
}

function postmark(text) {
  return `<svg class="pmark" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#2B2620" stroke-width="3"/><circle cx="50" cy="50" r="30" fill="none" stroke="#2B2620" stroke-width="2"/><path id="pm-arc" d="M12 50A38 38 0 0 1 88 50" fill="none"/><text font-size="11" font-family="Capriola,sans-serif" letter-spacing="1.5" fill="#2B2620"><textPath href="#pm-arc" startOffset="50%" text-anchor="middle">WELCOME BACK</textPath></text><text x="50" y="55" text-anchor="middle" font-size="13" font-family="Capriola,sans-serif" fill="#2B2620">${text}</text><path d="M18 78H82M22 86H78" stroke="#2B2620" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

export function createPostcard({ sim, send, scene }) {
  const modal = $('offline'), mail = $('mail');
  let open = false;

  function show() {
    const o = sim.state.offline;
    if (!o) return;
    $('awaytime').textContent = fmtDuration(o.awayS);
    // The second postmark gets a distinct arc id so the two <textPath> references do not clash.
    document.querySelectorAll('.pm-host').forEach((h, i) => { h.innerHTML = postmark(fmtPostmark(o.awayS)).replace(/pm-arc/g, 'pm-arc' + i); });
    const full = Math.max(o.fullS, 1), ease = o.easeS;
    $('bar-full').style.flex = String(full); $('bar-ease').style.flex = String(ease); $('bar-ease').style.display = ease > 60 ? '' : 'none';
    $('bars').setAttribute('aria-label', fmtDuration(o.fullS) + ' at full rate' + (ease > 60 ? ', then ' + fmtDuration(ease) + ' easing off' : ''));
    $('cap-full').textContent = fmtDuration(o.fullS) + ' full rate';
    $('cap-ease').textContent = ease > 60 ? fmtDuration(ease) + ' easing off' : '';
    $('gain-coins').textContent = '+' + fmt(o.coins);
    $('gain-parts').textContent = '+' + fmt(o.parts);
    $('pcmsg').textContent = note(sim.state.log, sim.state.night);
    $('photocap').textContent = caption(sim.state.night);
    mail.dataset.state = 'closed';
    modal.hidden = false; open = true;
    scene.snapshot($('snap'));
    $('openmail').focus();
  }
  function hide() { modal.hidden = true; open = false; }

  $('openmail').onclick = () => { mail.dataset.state = 'open'; setTimeout(() => $('collect').focus(), 1000); };
  $('collect').onclick = () => { send({ type: 'collectOffline' }); hide(); };

  return {
    show, hide, isOpen: () => open,
    // throttled by the caller
    frame(t) { scene.renderDusk(t, [$('stamp1'), $('stamp2')]); },
  };
}
