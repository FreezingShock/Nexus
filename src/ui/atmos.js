// The Time and weather section of the Settings card: the time of day, the day length, the season and its length, and
// the weather. Each click writes through the calendar store (core/calendar.js), which hands the choice to the sim.
// The sim only changes what the sky shows; the clock and the weather rolls keep going.
import { clockText } from '../core/calendar.js';

const ROWS = [
  { key: 'timeLock', label: 'Time of day', text: { auto: 'Cycle', day: 'Lock day', night: 'Lock night' } },
  { key: 'dayLength', label: 'Day length', text: { quick: '5 min', normal: '12 min', slow: '24 min' } },
  { key: 'season', label: 'Season', text: { auto: 'Auto', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' } },
  { key: 'seasonLength', label: 'Season length', text: { short: 'Short', normal: 'Normal', long: 'Long' } },
  { key: 'weather', label: 'Weather', text: { auto: 'Auto', clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog', leaves: 'Leaves' } },
];
const WEATHER_WORDS = { clear: 'clear skies', cloudy: 'cloud', rain: 'rain', snow: 'snow', fog: 'fog', leaves: 'leaves on the wind' };
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// The one line under the heading: what the sky is doing right now.
export function skyLine(state) {
  const sky = state.night ? 'Night' : cap(state.season || 'spring');
  return sky + ', ' + clockText(state.hour ?? 8) + ', ' + (WEATHER_WORDS[state.weatherKind] || 'clear skies') + '.';
}

export function atmosMarkup(o, state) {
  const rows = ROWS.map((r) => {
    const opts = Object.entries(r.text).map(([v, t]) =>
      `<button class="gfx-opt" data-key="${r.key}" data-value="${v}" aria-pressed="${String(o[r.key] === v)}">${t}</button>`).join('');
    return `<div class="gfx-row"><span class="gfx-label">${r.label}</span><div class="gfx-seg" role="group" aria-label="${r.label}">${opts}</div></div>`;
  }).join('');
  return `<section class="gfx" aria-label="Time and weather">
    <h3 class="h-disp">Time and weather</h3>
    <p class="sub gfx-note">${skyLine(state)}</p>
    ${rows}
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
