// The date: a cream plaque bottom-right with today's date, a hover card with the full date and what is coming, and a
// calendar panel (click it, or press K): a month page of day cells to click, a year ribbon, and skips to tomorrow or next month.
// Reads sim snapshots and sends commands; skipping is closed form in the sim (sim.skipToDay), never a loop over ticks.
import { MONTH_NAMES, MONTH_SHORT, SEASONS, monthDaysOf, seasonOfMonth } from '../../core/calendar.js';
import { MARKET } from '../../core/holidays.js';
import { iconFor } from '../holiday-icons.js';
import { AMOUNTS, PALETTES, lightsFor } from '../../core/festive.js';
import { eventById } from '../../core/events.js';
import { $ } from '../format.js';
import { clockText, coverText, dateOf, eventInfo, inDaysText, longDate, monthCells, nextMonthSkip, seasonName, shortDate, todayLine, townDays, upcoming, yearLine, yearRibbon } from '../date-text.js';

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
      <div class="band" id="dpband">
        <div class="dbig"><b class="h-disp" id="dpnum"></b>
          <div><h2 class="h-disp" id="dpd"></h2><div class="sub" id="dps"></div></div></div>
        <p class="dtoday" id="dptoday"></p>
      </div>
      <div class="devent" id="dpevent" hidden></div>
      <div class="pad">
        <section class="gsec"><h3 id="dpmonthname"></h3>
          <div class="dmonth" id="dmonth"></div>
          <div class="dskips"><button class="btn" id="dptomorrow" type="button"></button><button class="btn primary" id="dpnextmonth" type="button"></button></div>
        </section>
        <div class="dyear" id="dyear" aria-label="The year"></div>
        <section class="gsec dfest" id="dpfest"><h3>Decorations</h3>
          <div class="seg" id="dpamount" role="radiogroup" aria-label="How much the town dresses up"></div>
          <div class="dpal" id="dppal"></div>
          <p class="sub dnote">The town decorates itself for free. Switch a building's lights off from its card.</p>
        </section>
        <section class="gsec"><h3>Coming up</h3><ul class="glist" id="dpnext"></ul></section>
        <p class="sub dnote">Skipped days pay half of what the same time away would. The weather, seasons and festivals carry on as if you had waited.</p>
      </div>`;
    const app = $('app');
    app.append(plaque, tip, panel);

    const md = () => monthDaysOf(sim.calendarOptions);
    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };

    function paintPanel() {
      const mdv = md();
      set('dpnum', String(s.dayOfMonth));
      set('dpd', MONTH_NAMES[s.month] + ', Year ' + s.year);
      set('dps', townDays(s) + ' · ' + clockText(s.routineHour ?? s.hour));
      $('dpband').dataset.season = SEASONS[seasonOfMonth(s.month)];
      const t = todayLine(s);
      const today = $('dptoday');
      today.innerHTML = t ? iconFor(s.holiday || 'market', 18) + '<span>Today: ' + t + '</span>' : '<span>A quiet day in the ' + seasonName(s).toLowerCase() + '.</span>';
      set('dpmonthname', MONTH_NAMES[s.month]);
      paintEvent();
      paintFestive();

      const cells = monthCells(s, mdv);
      const grid = $('dmonth');
      const csig = cells.map((c) => c.when + c.holiday + c.market).join() + s.month;
      if (grid.dataset.sig !== csig) {
        grid.dataset.sig = csig;
        grid.style.setProperty('--cols', String(mdv));
        grid.innerHTML = cells.map((c) => {
          const ico = c.holiday ? iconFor(c.holiday, 22) : c.market ? iconFor('market', 22) : '';
          const label = (c.holiday ? c.name : c.market ? MARKET.name : '') || 'an ordinary day';
          const tag = c.when === 'ahead' ? 'button' : 'div';
          const go = c.when === 'ahead' ? ` type="button" data-day="${c.dayIdx}" title="Skip to ${c.day} ${MONTH_SHORT[s.month]}"` : '';
          return `<${tag} class="dcell" data-when="${c.when}" aria-label="${c.day} ${MONTH_NAMES[s.month]}, ${label}${c.when === 'today' ? ', today' : ''}"${go}><span class="dn">${c.day}</span><span class="di">${ico}</span>${c.when === 'today' ? '<small>today</small>' : ''}</${tag}>`;
        }).join('');
      }

      const next = nextMonthSkip(s, mdv);
      const tom = $('dptomorrow'), nm = $('dpnextmonth');
      const lastDay = s.dayOfMonth >= mdv;
      tom.dataset.day = String(s.dayIdx + 1);
      tom.textContent = 'Tomorrow';
      nm.dataset.day = String(next.day);
      nm.textContent = 'To ' + MONTH_NAMES[next.month] + ' · ' + next.inDays + (next.inDays > 1 ? ' days' : ' day');
      tom.hidden = lastDay; // on the last day tomorrow is next month

      const ribbon = yearRibbon(s, mdv);
      const rsig = ribbon.map((m) => (m.current ? '*' : '') + m.holiday).join();
      const yr = $('dyear');
      if (yr.dataset.sig !== rsig) {
        yr.dataset.sig = rsig;
        yr.innerHTML = ribbon.map((m) => `<span class="dmo" data-season="${m.season}"${m.event ? ` data-event="${m.event}"` : ''}${m.current ? ' data-current="1" aria-current="date"' : ''} title="${MONTH_NAMES[m.month]}${m.name ? ': ' + m.name : ''}"><em>${m.short}</em>${m.holiday ? iconFor(m.holiday, 14) : '<i></i>'}</span>`).join('');
      }

      const up = upcoming(s, mdv, 3);
      const list = $('dpnext');
      const usig = up.map((u) => u.id + u.dayIdx).join();
      if (list.dataset.sig !== usig) {
        list.dataset.sig = usig;
        list.innerHTML = up.map((u) => `<li>${iconFor(u.id, 18)}<span>${u.name}</span><small>${dateOf(u)} · ${inDaysText(u.inDays)}</small></li>`).join('') +
          `<li>${iconFor('firstsnow', 18)}<span>First Snow</span><small>whenever winter brings it</small></li>`;
      }
    }

    // The festive strip under the band: the season under way with how dressed the town is, or the next one coming.
    function paintEvent() {
      const ev = eventInfo(s, md()), box = $('dpevent');
      const sig = ev ? ev.id + ev.line + (ev.now ? Math.round(ev.cover * 100) : '') : '';
      if (box.dataset.sig === sig) return;
      box.dataset.sig = sig;
      box.hidden = !ev;
      if (!ev) return;
      box.dataset.event = ev.id;
      box.dataset.now = ev.now ? '1' : '';
      box.innerHTML = `<span class="deico">${iconFor(ev.id, 26)}</span><div><b class="h-disp">${ev.now ? ev.line : 'Next: ' + ev.name}</b>` +
        (ev.now ? `<span class="dcover"><i style="width:${Math.round(ev.cover * 100)}%"></i></span><small>${coverText(ev.cover)}</small>`
          : `<small>Decorations go up ${ev.inDays === 1 ? 'tomorrow' : 'in ' + ev.inDays + ' days'}</small>`) + '</div>';
    }

    // The town's festive style: how much it dresses up, and the colours of its lights for the season on (or next).
    function paintFestive() {
      const f = s.festive, ev = eventInfo(s, md());
      const id = ev ? ev.id : '';
      const sig = f.amount + JSON.stringify(f.palette) + id;
      const box = $('dpfest');
      if (box.dataset.sig === sig) return;
      box.dataset.sig = sig;
      $('dpamount').innerHTML = AMOUNTS.map((a) => `<button type="button" class="segb" role="radio" data-amount="${a.id}" aria-checked="${a.id === f.amount}" title="${a.line}">${a.name}</button>`).join('');
      const list = PALETTES[id] || [];
      const hx = (n) => '#' + n.toString(16).padStart(6, '0');
      $('dppal').innerHTML = list.length ? `<span class="dpalh">${eventById(id).name} lights</span>` + list.map((p) => {
        const cols = lightsFor(id, { palette: { [id]: p.id } });
        const on = (f.palette[id] || 'classic') === p.id;
        return `<button type="button" class="dpalb" data-ev="${id}" data-pal="${p.id}" aria-pressed="${on}" title="${p.name}">${cols.map((c) => `<i style="background:${hx(c)}"></i>`).join('')}<small>${p.name}</small></button>`;
      }).join('') : '';
    }

    function paintTip() {
      const up = upcoming(s, md(), 1)[0], t = todayLine(s), ev = eventInfo(s, md());
      tip.innerHTML = `<b class="h-disp">${longDate(s)}</b><span>${townDays(s)}</span>` +
        (t ? `<span class="tnow">Today: ${t}</span>` : '') +
        (ev && ev.now ? `<span class="tev">${ev.line}</span>` : '') +
        (up ? `<span>Next: ${up.name}, ${inDaysText(up.inDays)}</span>` : '');
    }

    function paintPlaque() {
      set('dchd', shortDate(s));
      set('dchs', yearLine(s));
      plaque.dataset.season = SEASONS[seasonOfMonth(s.month)];
      // in a festive season the badge wears the event's glyph and colour
      const badge = plaque.querySelector('.dbadge');
      if (plaque.dataset.event !== s.event) {
        plaque.dataset.event = s.event;
        badge.innerHTML = s.event ? iconFor(s.event, 26) : CAL_SVG;
      }
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
      if (on) { tip.hidden = true; paintPanel(); }
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
      const am = e.target.closest('button[data-amount]'), pal = e.target.closest('button[data-pal]');
      if (am) { send({ type: 'setFestive', amount: am.dataset.amount }); paintFestive(); return; }
      if (pal) { send({ type: 'setFestive', event: pal.dataset.ev, palette: pal.dataset.pal }); paintFestive(); return; }
      const b = e.target.closest('button[data-day]');
      if (!b || !b.dataset.day) return;
      send({ type: 'skipToDay', day: Number(b.dataset.day) });
      paintPanel();
    });
    document.addEventListener('pointerdown', (e) => { if (open && !panel.contains(e.target) && !plaque.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); plaque.focus(); } });

    paintPlaque();
    return {
      frame() {
        // Cheap per-frame check: repaint only when the day, the festival or the settings change.
        const k = s.dayIdx + ':' + s.holiday + ':' + s.market + ':' + s.event + ':' + md();
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
