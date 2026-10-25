// Goals and milestones: one notebook page (src/ui/book.js) with two bookmark tabs. Today holds the Charge boost, the
// daily goals, the goals closest to their next stage and Renewal; Milestones holds every goal with its stages and rewards
// (src/ui/milestone-list.js). G opens Today, M opens Milestones. Also paints the Goals tile's charge bar and its dot when a
// new stage is waiting to be seen. Reads sim snapshots and sends commands.
import { BALANCE } from '../../sim/balance.js';
import { nearest, summary } from '../../sim/achievements.js';
import { dayKey, goalDef, pendingPoints, pointsMult } from '../../sim/progress.js';
import { $, fmt, fmtDuration } from '../format.js';
import { book } from '../book.js';
import { PAGE_ICONS } from '../page-icons.js';
import { milestonesHtml, paintMilestones, openGoal, nearHtml, pct } from '../milestone-list.js';

const CH = BALANCE.charge, GOALS = BALANCE.goals;
const SEEN_KEY = 'nexus.milestones.seen';
const readSeen = () => { try { const n = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(n) && n >= 0 ? n : 0; } catch { return 0; } };
const writeSeen = (n) => { try { localStorage.setItem(SEEN_KEY, String(n)); } catch { /* blocked storage: the dot just comes back next visit */ } };

export const GOAL_TABS = [
  { id: 'today', label: 'Today', color: '#D3E4C4', icon: PAGE_ICONS.goals },
  { id: 'milestones', label: 'Milestones', color: '#F2C9BA', icon: PAGE_ICONS.milestones },
];

export default {
  id: 'progress',
  create({ sim, send, toast }) {
    const s = sim.state;
    let dirty = true, acc = 0, armed = false, armTimer = 0, filter = 'all', seen = readSeen();

    // The Goals tile, in the menu before Settings: a charge bar under its name and a dot for a new stage.
    const btn = document.createElement('button');
    btn.className = 'ib goalsib'; btn.id = 'goalsbtn';
    btn.setAttribute('aria-label', 'Goals and milestones'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="chg" aria-hidden="true"><b></b></i><i class="dot" aria-hidden="true" hidden></i>';
    $('settingsbtn').before(btn);

    const isOpen = () => book.current() === 'goals';
    const today = () => `<div class="pg-cols">
        <div class="pg-col">
          <section class="pg-box gl-charge"><h3 class="h-disp">Charge <small id="gch"></small></h3>
            <div class="meter wide gl-bar" role="img" aria-label="Charge"><i id="gchbar"></i></div>
            <p class="pg-soft">Building and painting add Charge. Spend ${CH.boostCost} for double coins for a minute. Nothing needs it; it is a bonus for playing.</p>
            <button class="btn primary" type="button" id="gboost" data-act="boost">Boost</button></section>
          <section class="pg-box"><h3 class="h-disp">Today's goals</h3><ul class="glist" id="glist"></ul><p class="gl-bonus" id="gbonus"></p></section>
        </div>
        <div class="pg-col">
          <section class="pg-box"><h3 class="h-disp">Almost there <small id="gmcount"></small></h3><ul class="nearlist" id="gmlist"></ul>
            <button class="btn" type="button" data-act="all">Every milestone <kbd>M</kbd></button></section>
          <section class="pg-box gl-renew"><h3 class="h-disp">Renewal</h3>
            <p id="gren"></p>
            <button class="btn" type="button" id="grenew" data-act="renew">Renew town</button>
            <p class="pg-soft">Renewal starts the town over with fresh coins, Parts, roads and buildings. It keeps your points, unlocked roads, milestone stages and settings. Each point is +2% income, for good.</p></section>
        </div>
      </div>`;

    book.register('goals', {
      title: 'Goals and milestones', c: '#A8C179', icon: PAGE_ICONS.goals, tabs: GOAL_TABS,
      sub: () => { const sum = summary(s); return sum.stages + ' of ' + sum.totalStages + ' milestone stages · goals keep their progress until you finish them'; },
      render: ({ tab }) => (tab === 'milestones' ? milestonesHtml(s, filter) : today()),
      opened() { dirty = true; paintPage(); markSeen(); },
      click(e, { tab }) {
        const near = e.target.closest('.near');
        if (near) return jump(near);
        const chip = e.target.closest('[data-k="ms-filter"] .nb-chip');
        if (chip) { filter = chip.dataset.v; return book.refresh(); }
        const head = e.target.closest('.ag-head');
        if (head) { const more = head.closest('.ag').querySelector('.ag-more'), on = more.hidden; more.hidden = !on; head.setAttribute('aria-expanded', String(on)); return; }
        const act = e.target.closest('[data-act]');
        if (!act || tab !== 'today') return;
        if (act.dataset.act === 'boost') send({ type: 'boost' });
        if (act.dataset.act === 'all') book.pickTab('milestones');
        if (act.dataset.act === 'renew') renew();
        dirty = true;
      },
    });
    book.body().addEventListener('keydown', (e) => {
      const li = isOpen() && e.target.closest && e.target.closest('.near');
      if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); jump(li); }
    });
    // A row under "Almost there" opens its goal on the Milestones tab, in its own group.
    function jump(li) {
      filter = li.dataset.group;
      if (book.tab() === 'milestones') book.refresh(); else book.pickTab('milestones');
      openGoal(book.body(), li.dataset.goal);
    }
    function renew() {
      const gain = pendingPoints(s.runEarned);
      if (gain < 1) return toast('Renewal opens after ' + fmt(BALANCE.renewal.divisor) + ' coins in one run');
      if (!armed) {
        armed = true; $('grenew').textContent = 'Tap again to renew for +' + gain + (gain > 1 ? ' points' : ' point');
        clearTimeout(armTimer); armTimer = setTimeout(() => { armed = false; dirty = true; }, 4000);
        return;
      }
      armed = false; clearTimeout(armTimer);
      send({ type: 'renew' });
    }
    function open(tab) {
      if (isOpen() && book.tab() === tab) { book.close(); return; }
      if (!isOpen()) book.open('goals');
      book.pickTab(tab);
    }
    btn.onclick = () => open('today');
    function markSeen() { seen = summary(s).stages; writeSeen(seen); }

    const set = (id, text) => { const el = $(id); if (el && el.textContent !== text) el.textContent = text; };

    // Charge bar and dot on the tile; the page only while it is open. (Renewal left the header for now: it lives on Today.)
    function paintChip() {
      btn.querySelector('.chg b').style.width = pct(s.charge / CH.max) + '%';
      const fresh = summary(s).stages > seen && !isOpen(), dot = btn.querySelector('.dot');
      if (dot.hidden === fresh) dot.hidden = !fresh;
    }

    function paintToday() {
      const g = s.goals, t = dayKey(sim.now());
      const done = g.day === t ? g.doneToday : 0;
      const pts = pendingPoints(s.runEarned);
      set('gch', Math.floor(s.charge) + ' of ' + CH.max);
      $('gchbar').style.width = pct(s.charge / CH.max) + '%';
      const boost = $('gboost');
      if (s.boostS > 0) { boost.textContent = 'On · ' + fmtDuration(s.boostS); boost.disabled = true; }
      else { boost.textContent = 'Boost · ' + CH.boostCost + ' Charge'; boost.disabled = s.charge < CH.boostCost; }

      const goals = g.slots.map((slot) => {
        const def = goalDef(slot.k);
        const p = Math.min(def.target, Math.floor(slot.p));
        const reward = def.reward.parts ? '+' + def.reward.parts + ' Parts' : '+' + fmt(def.reward.coins) + ' coins';
        const full = p >= def.target;
        return `<li class="${full ? 'full' : ''}"><span class="gl-check" aria-hidden="true">${full ? '✓' : ''}</span><span class="gl-text"><b>${def.name}</b><small>${fmt(p)} of ${fmt(def.target)}</small></span><span class="gl-reward">${reward}</span><span class="meter wide"><i style="width:${pct(slot.p / def.target)}%"></i></span></li>`;
      }).join('');
      const list = $('glist');
      if (list.dataset.sig !== goals) { list.dataset.sig = goals; list.innerHTML = goals; }
      const streak = g.streak > 1 ? ' · ' + g.streak + '-day streak' : '';
      set('gbonus', g.bonusDay === t ? 'Daily bonus collected today' + streak
        : done + ' of ' + GOALS.open + ' done today. Finish all ' + GOALS.open + ' for a bonus' + streak);

      const sum = summary(s);
      set('gmcount', sum.stages + ' of ' + sum.totalStages + ' stages');
      const near = nearest(s, 3), sig = near.map((n) => n.goal.id + n.done + pct(n.frac)).join(), ml = $('gmlist');
      if (ml.dataset.sig !== sig) { ml.dataset.sig = sig; ml.innerHTML = near.map(nearHtml).join('') || '<li class="pg-soft">Every milestone is done. Thank you for the town.</li>'; }

      const bonus = pointsMult(s.points) - 1;
      set('gren', (pts >= 1
        ? 'Renewing now gives +' + pts + (pts > 1 ? ' points' : ' point') + '.'
        : 'This run: ' + fmt(s.runEarned) + ' coins. Renewal opens at ' + fmt(BALANCE.renewal.divisor) + ' coins in one run.')
        + ' You have ' + s.points + ' point' + (s.points === 1 ? '' : 's') + ' (+' + Math.round(bonus * 100) + '% income).');
      const rb = $('grenew');
      if (!armed) rb.textContent = pts >= 1 ? 'Renew for +' + pts + (pts > 1 ? ' points' : ' point') : 'Renew town';
      rb.disabled = pts < 1;
    }
    function paintPage() {
      if (!isOpen()) return;
      if (book.tab() === 'milestones') paintMilestones(book.body(), s); else paintToday();
      const sum = summary(s);
      book.setSub(sum.stages + ' of ' + sum.totalStages + ' milestone stages · goals keep their progress until you finish them');
      seen = Math.max(seen, sum.stages);
    }

    return {
      frame(dt) {
        acc += dt;
        if (acc < 0.25 && !dirty) return;
        acc = 0;
        paintChip();
        paintPage();
        dirty = false;
      },
      onEvent(e) { if (e.type === 'changed' || e.type === 'renewed' || e.type === 'goalDone' || e.type === 'boosted' || e.type === 'milestone') dirty = true; },
      onKey(e) {
        if (e.key === 'g' || e.key === 'G') { open('today'); return true; }
        if (e.key === 'm' || e.key === 'M') { open('milestones'); return true; }
        return false;
      },
    };
  },
};
