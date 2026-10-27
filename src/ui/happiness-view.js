// The Happiness plaque and panel, as words and markup. Happiness is not a percentage: each home looks at what it can reach
// on foot (services, parks, shops, landmarks) and at any workshops nearby, so the plaque shows a mood word and a face,
// and the panel says how many homes have what in reach. Pure: advice in (src/sim/happiness-advice.js), HTML out.
import { ADVICE } from '../sim/services-config.js';

// Which step of the mood ladder a level is on: 1 (just getting started) to 4 (cozy). 0 when nothing is built.
export function moodStep(label) {
  const i = ADVICE.levels.findIndex((l) => l.label === label);
  return i < 0 ? 0 : ADVICE.levels.length - i;
}

// A face for each step: a small smile that grows, and rosy cheeks at the top.
const MOUTH = { 0: 'M9 16.2H17', 1: 'M9 16Q13 17.4 17 16', 2: 'M8.8 15.4Q13 18.6 17.2 15.4', 3: 'M8.6 15Q13 19.6 17.4 15', 4: 'M8.4 14.6Q13 21 17.6 14.6Z' };
export function faceSvg(step, size = 26) {
  const cheeks = step >= 3 ? '<circle cx="7.6" cy="15" r="1.7" fill="#E3A08E" opacity=".8"/><circle cx="18.4" cy="15" r="1.7" fill="#E3A08E" opacity=".8"/>' : '';
  const eyes = step >= 4 ? '<path d="M8.3 11.4Q9.7 9.6 11.1 11.4M14.9 11.4Q16.3 9.6 17.7 11.4" fill="none" stroke="#2B2620" stroke-width="1.7" stroke-linecap="round"/>'
    : '<circle cx="9.7" cy="11" r="1.3" fill="#2B2620"/><circle cx="16.3" cy="11" r="1.3" fill="#2B2620"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9.5" fill="#F7E3A6" stroke="#2B2620" stroke-width="2"/>${cheeks}${eyes}` +
    `<path d="${MOUTH[step] || MOUTH[0]}" fill="${step >= 4 ? '#FBF6EA' : 'none'}" stroke="#2B2620" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// The ladder under the word on the plaque: four pips, as many filled as the step.
export const pipsHtml = (step) => Array.from({ length: ADVICE.levels.length }, (_, i) => `<i class="${i < step ? 'on' : ''}"></i>`).join('');

// What each kind is, in the model's own terms (src/sim/services-config.js).
export const FACTORS = [
  { k: 'service', name: 'Services', what: 'clinics, schools, fire stations and police', c: '#CFE0E8', one: 'service', many: 'services',
    icon: '<path d="M5 9h16v13H5Z" fill="#FBF6EA"/><path d="M3.5 9.5L13 4l9.5 5.5Z" fill="#9CC3D5"/><path d="M13 12.5v6.5M9.8 15.8h6.4" stroke="#C96F4F" stroke-width="2.6"/>' },
  { k: 'park', name: 'Green space', what: 'greens, plazas, playgrounds, ponds, gardens, squares and orchards', c: '#D3E4C4', one: 'park', many: 'parks',
    icon: '<path d="M11.8 15.5h2.4V22h-2.4Z" fill="#9A6B45"/><circle cx="13" cy="10.5" r="6.5" fill="#8FB06A"/><path d="M4 22.5h18"/>' },
  { k: 'shop', name: 'Shops', what: 'shop rows, cafés, markets and grown shops', c: '#F6DDA0', one: 'shop', many: 'shops',
    icon: '<path d="M5 12h16v10H5Z" fill="#FBF6EA"/><path d="M4 7.5h18l-1.5 4.5H5.5Z" fill="#E6BC62"/><path d="M8 7.5L7 12M13 7.5V12M18 7.5l1 4.5" stroke-width="1.4"/><path d="M11 22v-5h4v5" fill="#C96F4F"/>' },
  { k: 'landmark', name: 'Landmarks', what: 'the town hall and the church', c: '#F2C9BA', one: 'landmark', many: 'landmarks',
    icon: '<path d="M8 22V11l5-5 5 5v11Z" fill="#FBF6EA"/><path d="M13 3v3M11.5 4.5h3"/><path d="M11 22v-4.5a2 2 0 0 1 4 0V22" fill="#97553E"/><path d="M4 22.5h18"/>' },
];
const INDUSTRY_ICON = '<path d="M4 22V13l5 3v-3l5 3v-3l5 3V7h3v15Z" fill="#B9A47E"/><path d="M19.5 5c1-1.5 3-1.5 3.5-3" stroke-width="1.5"/>';
const icon = (body) => `<svg viewBox="0 0 26 26" fill="none" stroke="#2B2620" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const share = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

// The plaque's hover card: the word, the sentence, a nudge to click.
export function hoverHtml(adv) {
  if (!adv.built) return '<h3>Happiness</h3><p class="pc-lead">It appears once there are homes. Shops, parks and clinics lift the homes around them.</p>';
  return `<h3>${adv.level.label}</h3><p class="pc-lead">${adv.summary}</p><p class="pc-note">Click to see what homes can reach, and what to try next.</p>`;
}

// The panel. Tips carry data-tip (their index) for the Show buttons.
export function panelHtml(adv) {
  const step = moodStep(adv.level.label), H = adv.homes || 0, sv = adv.served || { well: 0, some: 0, none: 0 };
  let html = `<header class="hp-top"><span class="hp-face">${faceSvg(step, 46)}</span><div><p class="hp-level">${adv.level.label}</p>` +
    `<span class="hp-pips" aria-label="Step ${step} of ${ADVICE.levels.length}">${pipsHtml(step)}</span></div></header>` +
    `<p class="hp-summary">${adv.summary}</p>`;
  if (H) {
    html += `<div class="hp-homes" role="img" aria-label="${sv.well} homes well served, ${sv.some} with one thing in reach, ${sv.none} with nothing yet">` +
      `<i class="w" style="width:${share(sv.well, H)}%"></i><i class="s" style="width:${share(sv.some, H)}%"></i><i class="n" style="width:${share(sv.none, H)}%"></i></div>` +
      `<p class="hp-key"><span class="w">${sv.well} well served</span><span class="s">${sv.some} with one thing</span><span class="n">${sv.none} with nothing yet</span></p>`;
    const rows = FACTORS.map((f) => {
      const n = adv.reached ? adv.reached[f.k] : 0, src = adv.counts ? adv.counts[f.k] || 0 : 0;
      return `<li style="--c:${f.c}"><span class="hp-ico">${icon(f.icon)}</span><span class="hp-fx"><b>${f.name}</b><small>${src ? plural(src, f.one, f.many) + ' · ' : ''}${f.what}</small></span>` +
        `<span class="hp-n"><em>${n} of ${H}</em><span class="hp-bar"><i style="width:${share(n, H)}%"></i></span></span></li>`;
    });
    if (adv.counts && adv.counts.industry) {
      rows.push(`<li class="drag" style="--c:#E7D8BF"><span class="hp-ico">${icon(INDUSTRY_ICON)}</span><span class="hp-fx"><b>Workshops nearby</b><small>${plural(adv.counts.industry, 'site', 'sites')} · eases homes a little, never below calm</small></span>` +
        `<span class="hp-n"><em>${adv.touched || 0} of ${H}</em><span class="hp-bar"><i style="width:${share(adv.touched || 0, H)}%"></i></span></span></li>`);
    }
    html += `<section class="hp-section"><h4>What homes can reach on foot</h4><ul class="hp-factors">${rows.join('')}</ul></section>`;
  }
  html += `<section class="hp-section"><h4>Things to try</h4>` + (adv.tips.length
    ? `<ol class="hp-tips">${adv.tips.map((t, i) => `<li><span>${t.text}.</span><button class="hp-show" type="button" data-tip="${i}" aria-label="Show: ${t.text}">Show</button></li>`).join('')}</ol>`
    : `<p class="hp-quiet">${adv.built ? 'Every home is nicely covered. Enjoy the quiet.' : 'Tips appear once there are homes to look after.'}</p>`) + '</section>';
  html += `<details class="hp-how"><summary>How happiness works</summary><p>Each home looks at what is within a short walk. Every service, park, shop and landmark in reach lifts it, a little less for each extra one. Workshops close by ease it down a little, but never below calm. Roads do not change it. Happier streets earn more coins and grow faster.</p></details>`;
  return html;
}
