// Town goals: the Goals card (Charge boost, daily goals, milestones, Renewal) and the Renewal chip in the header.
// Reads sim snapshots and sends commands. Static markup is built once so the buttons keep their clicks while numbers update.
import { BALANCE } from '../../sim/balance.js';
import { dayKey, goalDef, pendingPoints, pointsMult, runNeededFor } from '../../sim/progress.js';
import { $, fmt, fmtDuration } from '../format.js';

const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';
const FLAG_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 5H17L14 9.5L17 14H5" fill="#E6BC62" stroke="#2B2620" stroke-width="2" stroke-linejoin="round"/></svg>';
const CH = BALANCE.charge, GOALS = BALANCE.goals;
const pct = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));

export default {
  id: 'progress',
  create({ sim, send, toast }) {
    const s = sim.state;
    let open = false, dirty = true, acc = 0, armed = false, armTimer = 0;

    // Goals button sits in the control bar, before Settings.
    const btn = document.createElement('button');
    btn.className = 'ib goalsib'; btn.id = 'goalsbtn';
    btn.setAttribute('aria-label', 'Town goals'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = FLAG_SVG + '<i class="chg" aria-hidden="true"><b></b></i>';
    $('settingsbtn').before(btn);

    const card = document.createElement('aside');
    card.id = 'goals'; card.className = 'card'; card.hidden = true;
    card.setAttribute('aria-label', 'Town goals');
    card.innerHTML = `<button class="x" id="gx" aria-label="Close">${CLOSE_SVG}</button>
      <div class="band"><h2 class="h-disp">Town goals</h2><div class="sub" id="gday"></div></div>
      <div class="pad">
        <section class="gsec">
          <div class="grow"><b>Charge <span id="gch"></span></b><button class="btn primary" id="gboost">Boost</button></div>
          <div class="meter wide" role="img" aria-label="Charge"><i id="gchbar"></i></div>
          <p class="sub">Building and painting add Charge. Spend ${CH.boostCost} for double coins for a minute. Nothing needs it; it is a bonus for playing.</p>
        </section>
        <section class="gsec"><h3>Today's goals</h3><ul class="glist" id="glist"></ul><p class="sub" id="gbonus"></p></section>
        <section class="gsec"><h3>Milestones <small id="gmcount"></small></h3><ul class="glist" id="gmlist"></ul></section>
        <section class="gsec">
          <h3>Renewal</h3>
          <p class="sub" id="gren"></p>
          <button class="btn" id="grenew">Renew town</button>
          <p class="sub">Renewal starts the town over with fresh coins, Parts, roads and buildings. It keeps your points, unlocked roads, milestones and settings. Each point is +2% income, for good.</p>
        </section>
      </div>`;
    $('app').appendChild(card);

    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
    const todayKey = () => dayKey(sim.now());

    btn.onclick = () => toggle();
    $('gx').onclick = () => toggle(false);
    $('gboost').onclick = () => send({ type: 'boost' });
    $('grenew').onclick = () => {
      const gain = pendingPoints(s.runEarned);
      if (gain < 1) return toast('Renewal opens after ' + fmt(BALANCE.renewal.divisor) + ' coins in one run');
      if (!armed) {
        armed = true; $('grenew').textContent = 'Tap again to renew for +' + gain + (gain > 1 ? ' points' : ' point');
        clearTimeout(armTimer); armTimer = setTimeout(() => { armed = false; dirty = true; }, 4000);
        dirty = true; return;
      }
      armed = false; clearTimeout(armTimer);
      send({ type: 'renew' });
    };

    function toggle(force) {
      open = force === undefined ? !open : force;
      card.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-pressed', String(open));
      dirty = true;
    }

    // Charge bar on the button and the Renewal chip in the header; the goals card only when open.
    function paintChip() {
      const pts = pendingPoints(s.runEarned), need = runNeededFor(pts);
      set('renewal', pct(s.runEarned / need) + '%');
      $('renewalbar').style.width = pct(s.runEarned / need) + '%';
      btn.querySelector('.chg b').style.width = pct(s.charge / CH.max) + '%';
    }

    function paintCard() {
      const g = s.goals, t = todayKey();
      const done = g.day === t ? g.doneToday : 0;
      const pts = pendingPoints(s.runEarned);
      set('gday', 'Goals keep their progress until you finish them');
      set('gch', Math.floor(s.charge) + ' of ' + CH.max);
      $('gchbar').style.width = pct(s.charge / CH.max) + '%';
      const boost = $('gboost');
      if (s.boostS > 0) { boost.textContent = 'On · ' + fmtDuration(s.boostS); boost.disabled = true; }
      else { boost.textContent = 'Boost · ' + CH.boostCost; boost.disabled = s.charge < CH.boostCost; }

      $('glist').innerHTML = g.slots.map((slot) => {
        const def = goalDef(slot.k);
        const p = Math.min(def.target, Math.floor(slot.p));
        const reward = def.reward.parts ? '+' + def.reward.parts + ' Parts' : '+' + fmt(def.reward.coins) + ' coins';
        return `<li><div class="grow"><b>${def.name}</b><small>${reward}</small></div><div class="meter wide"><i style="width:${pct(slot.p / def.target)}%"></i></div><small class="gp">${fmt(p)} of ${fmt(def.target)}</small></li>`;
      }).join('');
      const streak = g.streak > 1 ? ' · ' + g.streak + '-day streak' : '';
      set('gbonus', g.bonusDay === t ? 'Daily bonus collected today' + streak
        : done + ' of ' + GOALS.open + ' done today. Finish all ' + GOALS.open + ' for a bonus' + streak);

      const doneIds = new Set(s.milestones);
      const left = BALANCE.milestones.filter((m) => !doneIds.has(m.id));
      set('gmcount', doneIds.size + ' of ' + BALANCE.milestones.length);
      $('gmlist').innerHTML = left.slice(0, 3).map((m) => {
        const v = m.stat === 'earned' ? s.earned : m.stat === 'renewals' ? s.renewals : (s.stats[m.stat] || 0);
        return `<li><div class="grow"><b>${m.text}</b><small>${m.reward.parts ? '+' + m.reward.parts + ' Parts' : '+' + fmt(m.reward.coins) + ' coins'}</small></div><div class="meter wide"><i style="width:${pct(v / m.n)}%"></i></div><small class="gp">${fmt(Math.min(v, m.n))} of ${fmt(m.n)}</small></li>`;
      }).join('') || '<li><b>Every milestone is done. Thank you for the town.</b></li>';

      const bonus = pointsMult(s.points) - 1;
      set('gren', (pts >= 1
        ? 'Renewing now gives +' + pts + (pts > 1 ? ' points' : ' point') + '.'
        : 'This run: ' + fmt(s.runEarned) + ' coins. Renewal opens at ' + fmt(BALANCE.renewal.divisor) + ' coins in one run.')
        + ' You have ' + s.points + ' point' + (s.points === 1 ? '' : 's') + ' (+' + Math.round(bonus * 100) + '% income).');
      const rb = $('grenew');
      if (!armed) { rb.textContent = pts >= 1 ? 'Renew for +' + pts + (pts > 1 ? ' points' : ' point') : 'Renew town'; }
      rb.disabled = pts < 1;
    }

    return {
      frame(dt) {
        acc += dt;
        if (acc < 0.25 && !dirty) return;
        acc = 0;
        paintChip();
        if (open) paintCard();
        dirty = false;
      },
      onEvent(e) { if (e.type === 'changed' || e.type === 'renewed' || e.type === 'goalDone' || e.type === 'boosted') dirty = true; },
      onKey(e) {
        if (e.key === 'g' || e.key === 'G') { toggle(); return true; }
        if (e.key === 'Escape' && open) { toggle(false); return true; }
        return false;
      },
    };
  },
};
