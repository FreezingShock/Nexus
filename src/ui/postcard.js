// The offline return: an envelope that opens to a postcard. Numbers come from the closed-form catch-up. What the card
// says lives in postcard-note.js; the flight of coins and parts into the HUD on collect lives in collect-fx.js.
import { $, fmt, fmtDuration, fmtPostmark } from './format.js';
import { writeNote, postscript } from './postcard-note.js';
import { burst } from './collect-fx.js';

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

const PREVIEW = { awayS: 6 * 3600 + 40 * 60, fullS: 4 * 3600, easeS: 2 * 3600 + 40 * 60, coins: 48250, parts: 312 };

export function createPostcard({ sim, send, scene, hud }) {
  const modal = $('offline'), mail = $('mail');
  let open = false, previewing = false, current = null;

  // `sample` previews the postcard with made-up numbers (Settings). Collecting then pays nothing.
  function show(sample) {
    const o = sample || sim.state.offline;
    if (!o) return;
    previewing = !!sample;
    $('awaytime').textContent = fmtDuration(o.awayS);
    $('awaytime').title = o.easeS > 60 ? fmtDuration(o.fullS) + ' at full rate, then ' + fmtDuration(o.easeS) + ' easing off' : 'All at full rate';
    // The second postmark gets a distinct arc id so the two <textPath> references do not clash.
    document.querySelectorAll('.pm-host').forEach((h, i) => { h.innerHTML = postmark(fmtPostmark(o.awayS)).replace(/pm-arc/g, 'pm-arc' + i); });
    $('gain-coins').textContent = '+' + fmt(o.coins);
    $('gain-parts').textContent = '+' + fmt(o.parts);
    $('gain-p').hidden = !(o.parts >= 1);
    $('pcmsg').textContent = writeNote({ log: sim.state.log, night: sim.state.night, offline: o, town: sim.state.town });
    $('pcps').textContent = postscript(o);
    $('pctown').textContent = (sim.state.town && sim.state.town.name) || 'Nexus';
    $('photocap').textContent = caption(sim.state.night);
    current = o;
    mail.dataset.state = 'closed';
    modal.hidden = false; open = true;
    scene.snapshot($('snap'));
    $('envelope').focus();
  }
  function hide() { modal.hidden = true; open = false; }

  // The whole envelope opens the card, by click, tap, Enter or Space.
  function openMail() {
    if (mail.dataset.state === 'open') return;
    mail.dataset.state = 'open';
    setTimeout(() => $('collect').focus(), 1000);
  }
  $('envelope').onclick = openMail;
  $('envelope').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMail(); } };
  // Collect: the sim pays at once, the HUD holds the amounts back, and icons burst from the button into the counters,
  // each landing letting its share in. A preview flies the icons but pays nothing, so the counters stay put.
  const ICONS = { coins: $('gain-c').querySelector('svg').outerHTML, parts: $('gain-p').querySelector('svg').outerHTML };
  $('collect').onclick = () => {
    const o = current, from = $('collect');
    if (!o || !open) return;
    const pay = !previewing;
    if (pay) { hud.hold('coins', Math.floor(o.coins)); hud.hold('parts', Math.floor(o.parts)); send({ type: 'collectOffline' }); }
    const kinds = ['coins', 'parts'].map((key) => ({
      key, amount: o[key], target: hud.badgeOf(key), icon: ICONS[key],
      onLand: (share, last) => { if (pay) hud.land(key, share, last ? '+' + fmt(o[key]) : ''); },
    }));
    burst(from, kinds);
    hide();
  };

  return {
    show, hide, preview: () => show(PREVIEW), isOpen: () => open,
    // throttled by the caller
    frame(t) { scene.renderDusk(t, [$('stamp1'), $('stamp2')]); },
  };
}
