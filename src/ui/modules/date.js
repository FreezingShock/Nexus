// The date: a cream plaque bottom-right with today's date, a hover card with the full date and what is coming, and a
// calendar panel (click it, or press K): a month page of day cells to click, a year ribbon, and skips to tomorrow or next month.
// Reads sim snapshots and sends commands; skipping is closed form in the sim (sim.skipToDay), never a loop over ticks.
import { MONTH_NAMES, MONTH_SHORT, SEASONS, monthDaysOf, seasonOfMonth } from '../../core/calendar.js';
import { MARKET } from '../../core/holidays.js';
import { iconFor } from '../holiday-icons.js';
import { PALETTES, lightsFor } from '../../core/festive.js';
import { eventById } from '../../core/events.js';
import { $ } from '../format.js';
import { clockText, coverText, dateOf, decorSets, eventInfo, inDaysText, longDate, monthCells, nextMonthSkip, seasonName, shortDate, todayLine, townDays, upcoming, yearLine, yearRibbon } from '../date-text.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';
const CAL_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="#FBF6EA"/><path d="M3.5 10H20.5M8 3V7M16 3V7"/></svg>';

export default {
  id: 'date',
  create({ sim, send }) {
    const s = sim.state;
    let open = false, key = '', hover = false, tab = 'month', picked = '';

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
          <div><h2 class="h-disp" id="dpd"></h2><div class="sub" id="dpy"></div><div class="sub" id="dps"></div></div></div>
        <p class="dtoday" id="dptoday"></p>
      </div>
      <div class="devent" id="dpevent" hidden></div>
      <div class="dtabs" role="tablist" aria-label="Calendar views">
        <button type="button" class="dtab" role="tab" data-tab="month" id="dtab-month">Month</button>
        <button type="button" class="dtab" role="tab" data-tab="year" id="dtab-year">Year</button>
        <button type="button" class="dtab" role="tab" data-tab="decor" id="dtab-decor">Decorations</button>
      </div>
      <div class="pad">
        <section class="dpane" data-pane="month" role="tabpanel" aria-labelledby="dtab-month">
          <div class="dmstrip" id="dmstrip"></div>
          <div class="dmonth" id="dmonth"></div>
          <div class="dskips"><button class="btn" id="dptomorrow" type="button"></button><button class="btn primary" id="dpnextmonth" type="button"></button></div>
          <h3 class="dh">Coming up</h3><ul class="glist" id="dpnext"></ul>
        </section>
        <section class="dpane" data-pane="year" role="tabpanel" aria-labelledby="dtab-year">
          <p class="sub dnote">Click a month to fast-forward to its first day.</p>
          <div class="dyear" id="dyear" aria-label="The year"></div>
        </section>
        <section class="dpane dfest" data-pane="decor" role="tabpanel" aria-labelledby="dtab-decor" id="dpfest">
          <button type="button" class="dswitch" id="dpswitch" role="switch"></button>
          <div class="dsets" id="dpsets"></div>
          <div class="dpal" id="dppal"></div>
        </section>
        <p class="sub dnote">Skipped days pay half of what the same time away would. The weather, seasons and festivals carry on as if you had waited.</p>
      </div>`;
    const app = $('app');
    app.append(plaque, tip, panel);

    const md = () => monthDaysOf(sim.calendarOptions);
    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };

    function paintPanel() {
      const mdv = md();
      set('dpnum', String(s.dayOfMonth));
      set('dpd', MONTH_NAMES[s.month]);
      set('dpy', 'Year ' + s.year + ' · ' + seasonName(s) + ' · day ' + s.dayOfMonth + ' of ' + mdv);
      set('dps', townDays(s) + ' · ' + clockText(s.routineHour ?? s.hour));
      $('dpband').dataset.season = SEASONS[seasonOfMonth(s.month)];
      const t = todayLine(s);
      const today = $('dptoday');
      today.innerHTML = t ? iconFor(s.holiday || 'market', 18) + '<span>Today: ' + t + '</span>' : '<span>A quiet day in the ' + seasonName(s).toLowerCase() + '.</span>';
      paintTabs();
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
      // the month strip: last month, this one, next (next fast-forwards to its first day)
      const prev = (s.month + 11) % 12;
      const strip = $('dmstrip');
      const ssig = s.month + ':' + next.day;
      if (strip.dataset.sig !== ssig) {
        strip.dataset.sig = ssig;
        strip.innerHTML = `<span class="dms" data-past="1">${MONTH_SHORT[prev]}</span><span class="dms" data-current="1" aria-current="date">${MONTH_NAMES[s.month]}</span><button type="button" class="dms" data-day="${next.day}" title="Fast-forward to ${MONTH_NAMES[next.month]}">${MONTH_SHORT[next.month]}</button>`;
      }
      const rsig = ribbon.map((m) => (m.current ? '*' : m.inDays) + m.holiday + m.event).join();
      const yr = $('dyear');
      if (yr.dataset.sig !== rsig) {
        yr.dataset.sig = rsig;
        const bySeason = SEASONS.map((sn) => ribbon.filter((m) => m.season === sn).sort((a, b) => ((a.month + 1) % 12) - ((b.month + 1) % 12)));
        yr.innerHTML = bySeason.map((row) => `<div class="dseason" data-season="${row[0].season}"><h4>${seasonLabel(row[0].season)}</h4><div class="dsrow">` + row.map((m) => {
          const tag = m.current ? 'div' : 'button', go = m.current ? '' : ` type="button" data-day="${m.day}" title="Fast-forward to ${MONTH_NAMES[m.month]}, ${m.inDays} days away"`;
          return `<${tag} class="dmo" data-season="${m.season}"${m.event ? ` data-event="${m.event}"` : ''}${m.current ? ' data-current="1" aria-current="date"' : ''}${go}><b>${MONTH_NAMES[m.month]}</b><span class="dmi">${m.holiday ? iconFor(m.holiday, 18) : ''}<small>${m.name || ''}</small></span><em>${m.current ? 'You are here' : 'in ' + m.inDays + ' days'}</em></${tag}>`;
        }).join('') + '</div></div>').join('');
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

    const seasonLabel = (sn) => sn.charAt(0).toUpperCase() + sn.slice(1);

    function paintTabs() {
      for (const b of panel.querySelectorAll('.dtab')) { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      for (const p of panel.querySelectorAll('.dpane')) p.hidden = p.dataset.pane !== tab;
    }

    // The festive strip under the band: the season under way, or the next one coming.
    function paintEvent() {
      const ev = eventInfo(s, md()), box = $('dpevent');
      const sig = ev ? ev.id + ev.line + (ev.now ? 'n' : '') : '';
      if (box.dataset.sig === sig) return;
      box.dataset.sig = sig;
      box.hidden = !ev;
      if (!ev) return;
      box.dataset.event = ev.id;
      box.dataset.now = ev.now ? '1' : '';
      box.innerHTML = `<span class="deico">${iconFor(ev.id, 26)}</span><div><b class="h-disp">${ev.now ? ev.line : 'Next: ' + ev.name}</b>` +
        (ev.now ? '' : `<small>Decorations go up ${ev.inDays === 1 ? 'tomorrow' : 'in ' + ev.inDays + ' days'}</small>`) + '</div>';
    }

    // The Decorations tab: one switch (all out, or none), the seasonal sets with how to unlock each, and light colours.
    function paintFestive() {
      const f = s.festive, sets = decorSets(s, md());
      if (!picked || !sets.some((x) => x.id === picked && x.state !== 'locked')) picked = (sets.find((x) => x.state === 'showing' || x.state === 'season') || sets.find((x) => x.state !== 'locked') || {}).id || '';
      const sig = f.amount + JSON.stringify(f.palette) + f.optIn.join() + f.unlocked.join() + f.show + sets.map((x) => x.state).join() + picked;
      const box = $('dpfest');
      if (box.dataset.sig === sig) return;
      box.dataset.sig = sig;
      const on = f.amount !== 'none';
      const sw = $('dpswitch');
      sw.setAttribute('aria-checked', String(on));
      sw.innerHTML = `<span class="dsw-t"><b class="h-disp">Decorations</b><small>${on ? 'On: the town goes all out' : 'Off: no lights or props'}</small></span><i class="dsw-knob"></i>`;
      $('dpsets').dataset.off = on ? '' : '1';
      $('dpsets').innerHTML = sets.map((x) => {
        const act = x.state === 'ready' ? `<button type="button" class="btn small primary" data-show="${x.id}">Show now</button>`
          : x.state === 'showing' ? `<button type="button" class="btn small" data-show="">Put away</button>`
          : x.state === 'season' ? '<span class="dtag">In season</span>'
          : '<span class="dtag" data-lock="1">Locked</span>';
        const extra = x.optIn && x.state !== 'locked' ? `<label class="dauto"><input type="checkbox" data-optin="${x.id}"${f.optIn.includes(x.id) ? ' checked' : ''}> Every ${x.months}</label>` : '';
        return `<div class="dset" data-state="${x.state}" data-pick="${x.id}" data-picked="${x.id === picked ? '1' : ''}"><span class="deico">${iconFor(x.id, 24)}</span><div class="dsi"><b class="h-disp">${x.name}</b><small>${x.months}</small>${extra}</div>${act}</div>`;
      }).join('');
      const list = PALETTES[picked] || [];
      const hx = (n) => '#' + n.toString(16).padStart(6, '0');
      $('dppal').innerHTML = list.length ? `<span class="dpalh">${eventById(picked).name} lights</span>` + list.map((p) => {
        const cols = lightsFor(picked, { palette: { [picked]: p.id } });
        const sel = (f.palette[picked] || 'classic') === p.id;
        return `<button type="button" class="dpalb" data-ev="${picked}" data-pal="${p.id}" aria-pressed="${sel}" title="${p.name}">${cols.map((c) => `<i style="background:${hx(c)}"></i>`).join('')}<small>${p.name}</small></button>`;
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
      const tb = e.target.closest('button[data-tab]');
      if (tb) { tab = tb.dataset.tab; paintTabs(); return; }
      if (e.target.closest('#dpswitch')) { send({ type: 'setFestive', amount: s.festive.amount === 'none' ? 'all' : 'none' }); paintFestive(); return; }
      const opt = e.target.closest('input[data-optin]');
      if (opt) { send({ type: 'setEventOptIn', event: opt.dataset.optin, on: opt.checked }); paintFestive(); return; }
      const sh = e.target.closest('button[data-show]');
      if (sh) { picked = sh.dataset.show || picked; send({ type: 'setEventShow', event: sh.dataset.show }); paintPanel(); return; }
      const pick = e.target.closest('.dset[data-pick]');
      if (pick && pick.dataset.state !== 'locked' && !e.target.closest('button,label,input')) { picked = pick.dataset.pick; paintFestive(); return; }
      const pal = e.target.closest('button[data-pal]');
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
        const k = s.dayIdx + ':' + s.holiday + ':' + s.market + ':' + s.event + ':' + md() + ':' + s.festive.show + s.festive.unlocked.length + s.festive.amount;
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
