// The Sky tab of the Settings page: the time of day, the day length, the season and its length, and
// the weather. Each click writes through the calendar store (core/calendar.js), which hands the choice to the sim.
// The sim only changes what the sky shows; the clock and the weather rolls keep going.
import { clockText } from '../core/calendar.js';

const SEG_ROWS = [
  { key: 'dayLength', label: 'Day length', text: { quick: '1 min', normal: '2 min', slow: '4 min' } },
  { key: 'seasonLength', label: 'Month length', text: { short: '2 days', normal: '3 days', long: '4 days' } },
];
// Picture tiles. Seasons get a colour and a pattern (drawn in css/settings.css by data-value); the rest get a small icon.
const SEASON_TILES = { auto: 'Follow the clock', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
const TIME_TILES = { auto: 'Cycle', day: 'Day', night: 'Night' };
const WEATHER_TILES = { auto: 'Auto', clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog', leaves: 'Leaves' };
const P = 'fill="none" stroke="#2B2620" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const CLOUD = 'M7 17h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 17z';
const ICONS = {
  auto: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.2 2"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M5.6 18.4l1.5-1.5M16.9 7.1l1.5-1.5"/></svg>`,
  cloudy: `<svg viewBox="0 0 24 24" ${P}><path d="${CLOUD}" transform="translate(0 1)"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" ${P}><path d="${CLOUD}" transform="translate(0 -2)"/><path d="M8 18l-1 3M12.5 18l-1 3M17 18l-1 3"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/></svg>`,
  fog: `<svg viewBox="0 0 24 24" ${P}><path d="M4 8h13M7 12h13M4 16h11M9 20h9"/></svg>`,
  leaves: `<svg viewBox="0 0 24 24" ${P}><path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19L14 10"/></svg>`,
  day: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M5.6 18.4l1.5-1.5M16.9 7.1l1.5-1.5"/></svg>`,
  night: `<svg viewBox="0 0 24 24" ${P}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>`,
};
const WEATHER_WORDS = { clear: 'clear skies', cloudy: 'cloud', rain: 'rain', snow: 'snow', fog: 'fog', leaves: 'leaves on the wind' };
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// The one line under the heading: what the sky is doing right now.
export function skyLine(state) {
  const sky = state.night ? 'Night' : cap(state.season || 'spring');
  return sky + ', ' + clockText(state.hour ?? 8) + ', ' + (WEATHER_WORDS[state.weatherKind] || 'clear skies') + '.';
}

function tiles(key, o, labels, kind) {
  const out = Object.entries(labels).map(([v, t]) => {
    const art = kind === 'season' && v !== 'auto' ? '<span class="pat" aria-hidden="true"></span>' : `<span class="ico" aria-hidden="true">${ICONS[v] || ''}</span>`;
    return `<button class="stile ${kind}" data-key="${key}" data-value="${v}" aria-pressed="${String(o[key] === v)}"><span class="art">${art}</span><span class="nm">${t}</span></button>`;
  }).join('');
  return `<div class="stiles stiles-${kind}" role="group" aria-label="${key === 'season' ? 'Season' : key === 'weather' ? 'Weather' : 'Time of day'}">${out}</div>`;
}

export function atmosMarkup(o, state) {
  const segs = SEG_ROWS.map((r) => {
    const opts = Object.entries(r.text).map(([v, t]) =>
      `<button class="gfx-opt" data-key="${r.key}" data-value="${v}" aria-pressed="${String(o[r.key] === v)}">${t}</button>`).join('');
    return `<div class="gfx-row"><span class="gfx-label">${r.label}</span><div class="gfx-seg" role="group" aria-label="${r.label}">${opts}</div></div>`;
  }).join('');
  return `<section class="gfx" aria-label="Time and weather">
    <p class="sub gfx-note sky-now">${skyLine(state)}</p>
    <div class="sgroup"><span class="gfx-label">Season</span>${tiles('season', o, SEASON_TILES, 'season')}</div>
    <div class="sgroup"><span class="gfx-label">Weather</span>${tiles('weather', o, WEATHER_TILES, 'weather')}</div>
    <div class="sgroup"><span class="gfx-label">Time of day</span>${tiles('timeLock', o, TIME_TILES, 'time')}</div>
    <div class="sgroup sgroup-pace"><span class="gfx-label">Pace</span>${segs}</div>
  </section>`;
}

// Draws the section into `el` and keeps it in step with the store. Changes take effect at once.
export function mountAtmos(el, store, sim) {
  const paint = () => { el.innerHTML = atmosMarkup(store.get(), sim.state); };
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b) || !b.dataset.key) return;
    const key = b.dataset.key, value = b.dataset.value;
    if (!store.set(key, value)) return;
    paint();
    const back = el.querySelector(`[data-key="${key}"][data-value="${value}"]`);
    if (back) back.focus({ preventScroll: true }); // keep keyboard users where they were
  };
  paint();
}
