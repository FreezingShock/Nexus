// The date: a cream plaque bottom-right with today's date, a hover card with the full date and what is coming, and a
// calendar panel (click it, or press K) to skip ahead to tomorrow, the next market or festival, or a chosen date.
// Reads sim snapshots and sends commands; skipping is closed form in the sim (sim.skipToDay), never a loop over ticks.
import { MONTH_NAMES, SEASONS, monthDaysOf, seasonOfMonth } from '../../core/calendar.js';
import { $ } from '../format.js';
import { SKIP_MAX_YEARS, clockText, dateOf, inDaysText, longDate, pick, quickSkips, seasonName, shortDate, todayLine, townDays, upcoming, yearLine } from '../date-text.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';
const CAL_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="#FBF6EA"/><path d="M3.5 10H20.5M8 3V7M16 3V7"/></svg>';

export default {
  id: 'date',
  create({ sim, send }) {
    const s = sim.state;
    let open = false, key = '', hover = false, pickKey = '';

    const plaque = document.createElement('button');
    plaque.id = 'datechip'; plaque.className = 'card datechip'; plaque.type = 'button';
    plaque.setAttribute('aria-expanded', 'false'); plaque.setAttribute('aria-controls', 'datepanel');
    plaque.innerHTML = `<span class="dbadge" aria-hidden="true">${CAL_SVG}</span>
      <span class="dtxt"><b class="h-disp" id="dchd"></b><small id="dchs"></small></span><i class="dflag" id="dchf" hidden></i>`;

    const tip = document.createElement('div');
    tip.id = 'datetip'; tip.className = 'card datetip'; tip.dataset.mo = 'tag'; tip.hidden = true; tip.setAttribute('role', 'tooltip');

    const panel = document.createElement('aside');
    panel.id = 'datepanel'; panel.className = 'card datepanel'; panel.dataset.mo = 'up'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Calendar');
    panel.innerHTML = `<button class="x" id="datex" aria-label="Close">${CLOSE_SVG}</button>
      <div class="band"><h2 class="h-disp" id="dpd"></h2><div class="sub" id="dps"></div></div>
      <div class="pad">
        <p class="sub" id="dptoday"></p>
        <section class="gsec"><h3>Skip ahead</h3><div class="dquick" id="dquick"></div></section>
        <section class="gsec"><h3>Skip to a date</h3>
          <div class="dpick">
            <label>Day<select id="dpday" aria-label="Day"></select></label>
            <label>Month<select id="dpmonth" aria-label="Month"></select></label>
            <label>Year<select id="dpyear" aria-label="Year"></select></label>
          </div>
          <button class="btn primary" id="dpgo" type="button">Skip</button>
          <p class="sub" id="dpwhy"></p>
        </section>
        <section class="gsec"><h3>Coming up</h3><ul class="glist" id="dpnext"></ul></section>
        <p class="sub dnote">Skipped days pay half of what the same time away would. The weather, seasons and festivals carry on as if you had waited.</p>
      </div>`;
    const app = $('app');
    app.append(plaque, tip, panel);

    const md = () => monthDaysOf(sim.calendarOptions);
    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };

    // The pickers: months of the year, days of a month, this year and the next two.
    const monthSel = $('dpmonth'), daySel = $('dpday'), yearSel = $('dpyear');
    monthSel.innerHTML = MONTH_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    function fillDays() {
      const n = md();
      if (daySel.options.length === n) return;
      const keep = daySel.value || '1';
      daySel.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
      daySel.value = Number(keep) <= n ? keep : String(n);
    }
    function fillYears() {
      const first = s.year, last = first + SKIP_MAX_YEARS;
      if (yearSel.dataset.first === String(first)) return;
      yearSel.dataset.first = String(first);
      const keep = yearSel.value;
      yearSel.innerHTML = Array.from({ length: last - first + 1 }, (_, i) => `<option value="${first + i}">Year ${first + i}</option>`).join('');
      yearSel.value = keep && Number(keep) >= first ? keep : String(first);
    }
    function aim() { // the picker follows tomorrow when it is first shown
      fillDays(); fillYears();
      const next = s.dayIdx + 1, mdv = md();
      const months = Math.floor(next / mdv) + 2;
      monthSel.value = String(months % 12);
      daySel.value = String((next % mdv) + 1);
      yearSel.value = String(1 + Math.floor(months / 12));
    }

    function paintPick() {
      fillDays(); fillYears();
      const r = pick(s, md(), Number(yearSel.value), Number(monthSel.value), Number(daySel.value));
      const go = $('dpgo');
      go.disabled = !r.ok;
      set('dpgo', r.ok ? r.text : 'Skip');
      set('dpwhy', r.ok ? '' : r.why);
      go.dataset.day = r.ok ? String(r.day) : '';
    }

    function paintPanel() {
      set('dpd', longDate(s));
      set('dps', townDays(s) + ' · ' + clockText(s.routineHour ?? s.hour));
      const t = todayLine(s);
      set('dptoday', t ? 'Today: ' + t + '.' : 'A quiet day in the ' + seasonName(s).toLowerCase() + '.');
      const q = $('dquick');
      const quick = quickSkips(s, md());
      const sig = quick.map((x) => x.id + x.day).join();
      if (q.dataset.sig !== sig) {
        q.dataset.sig = sig;
        q.innerHTML = quick.map((x) => `<button class="btn" type="button" data-day="${x.day}">${x.label}<small>${inDaysText(x.inDays)}</small></button>`).join('');
      }
      const up = upcoming(s, md(), 3);
      const list = $('dpnext');
      const usig = up.map((u) => u.id + u.dayIdx).join();
      if (list.dataset.sig !== usig) {
        list.dataset.sig = usig;
        list.innerHTML = up.map((u) => `<li><span>${u.name}</span><small>${dateOf(u)} · ${inDaysText(u.inDays)}</small></li>`).join('') +
          '<li><span>First Snow</span><small>whenever winter brings it</small></li>';
      }
      paintPick();
    }

    function paintTip() {
      const up = upcoming(s, md(), 1)[0], t = todayLine(s);
      tip.innerHTML = `<b class="h-disp">${longDate(s)}</b><span>${townDays(s)}</span>` +
        (t ? `<span class="tnow">Today: ${t}</span>` : '') +
        (up ? `<span>Next: ${up.name}, ${inDaysText(up.inDays)}</span>` : '');
    }

    function paintPlaque() {
      set('dchd', shortDate(s));
      set('dchs', yearLine(s));
      plaque.dataset.season = SEASONS[seasonOfMonth(s.month)];
      const flag = $('dchf');
      const kind = s.holiday ? 'festival' : s.market ? 'market' : '';
      flag.hidden = !kind;
      flag.dataset.kind = kind;
      flag.title = todayLine(s);
      plaque.setAttribute('aria-label', 'Date: ' + longDate(s) + (kind ? '. ' + todayLine(s) : '') + '. Open the calendar');
    }

    function setOpen(on) {
      if (on === open) return;
      open = on;
      if (on) { tip.hidden = true; aim(); paintPanel(); }
      panel.hidden = !on;
      plaque.setAttribute('aria-expanded', String(on));
      plaque.setAttribute('aria-pressed', String(on));
    }

    plaque.onclick = () => setOpen(!open);
    $('datex').onclick = () => { setOpen(false); plaque.focus(); };
    const showTip = (on) => { hover = on; if (on && !open) { paintTip(); tip.hidden = false; } else tip.hidden = true; };
    plaque.addEventListener('pointerenter', () => showTip(true));
    plaque.addEventListener('pointerleave', () => showTip(false));
    plaque.addEventListener('focus', () => showTip(true));
    plaque.addEventListener('blur', () => showTip(false));
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-day], #dpgo');
      if (!b || !b.dataset.day) return;
      send({ type: 'skipToDay', day: Number(b.dataset.day) });
      paintPanel();
    });
    for (const el of [monthSel, daySel, yearSel]) el.addEventListener('change', paintPick);
    document.addEventListener('pointerdown', (e) => { if (open && !panel.contains(e.target) && !plaque.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); plaque.focus(); } });

    paintPlaque();
    return {
      frame() {
        // Cheap per-frame check: repaint only when the day, the festival or the settings change.
        const k = s.dayIdx + ':' + s.holiday + ':' + s.market + ':' + md();
        if (k !== key) { key = k; paintPlaque(); if (open) paintPanel(); else if (hover) paintTip(); }
        else if (open) set('dps', townDays(s) + ' · ' + clockText(s.routineHour ?? s.hour));
      },
      onKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'k') return false;
        setOpen(!open);
        return true;
      },
    };
  },
};
