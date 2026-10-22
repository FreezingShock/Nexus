// Milestones and achievements: a panel on the right (button in the control bar, key M) that lists every goal with its
// stages, progress bars and rewards. Reads the sim state and sends no commands: rewards are paid by the sim itself
// (systems/achievements.js), so this is all looking, never touching. Static markup is built once on first open so
// expanded goals keep their state while the numbers update.
import { GOALS, GROUPS, STAGES, fmtTarget, nearest, rewardFor, rewardLine, standing, summary, unlockFor } from '../../sim/achievements.js';
import { ROAD_TYPES } from '../../sim/catalog.js';
import { $, fmtCompact } from '../format.js';

const SEEN_KEY = 'nexus.milestones.seen';
const OPEN_EVENT = 'nexus:milestones';
const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/></svg>';
const MEDAL = (cls = '') => `<svg class="${cls}" width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 3L13.5 13M22 3L18.5 13" fill="none" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/><circle class="disc" cx="16" cy="19" r="9" stroke="#2B2620" stroke-width="2.2"/><path class="spark" d="M16 14.2L17.4 17.2L20.6 17.6L18.2 19.8L18.9 23L16 21.4L13.1 23L13.8 19.8L11.4 17.6L14.6 17.2Z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const BUTTON_SVG = '<svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 3L13.5 13M22 3L18.5 13" fill="none" stroke="#2B2620" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="19" r="9" fill="#E6BC62" stroke="#2B2620" stroke-width="2.4"/><path d="M16 14.2L17.4 17.2L20.6 17.6L18.2 19.8L18.9 23L16 21.4L13.1 23L13.8 19.8L11.4 17.6L14.6 17.2Z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.3" stroke-linejoin="round"/></svg>';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const roadName = (id) => { const t = ROAD_TYPES.find((r) => r.id === id); return t ? t.short : id; };
const pct = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));
const readSeen = () => { try { const n = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(n) && n >= 0 ? n : 0; } catch { return 0; } };
const writeSeen = (n) => { try { localStorage.setItem(SEEN_KEY, String(n)); } catch { /* blocked storage: the dot just comes back next visit */ } };

const pips = () => STAGES.map((s) => `<i style="--pc:${s.color}"></i>`).join('');

function goalHtml(g) {
  const stages = g.tiers.map((t, i) => {
    const r = rewardFor(g, i + 1);
    return `<li data-stage="${i}" style="--pc:${STAGES[i].color}"><i class="pip"></i><span class="st-name">${STAGES[i].name}</span><span class="st-target">${esc(fmtTarget(g, t))}</span><small class="st-reward">${esc(rewardLine(r, unlockFor(g, i + 1), roadName))}</small></li>`;
  }).join('');
  return `<li class="ag" data-goal="${g.id}">
    <button class="ag-head" type="button" aria-expanded="false">
      ${MEDAL('ag-medal')}
      <span class="ag-main"><b class="ag-name">${esc(g.name)}</b><small class="ag-prog"></small></span>
      <span class="ag-pips" aria-hidden="true">${g.tiers.map((_, i) => `<i style="--pc:${STAGES[i].color}"></i>`).join('')}</span>
    </button>
    <div class="meter wide" role="img" aria-label="${esc(g.name)} progress"><i></i></div>
    <p class="ag-next"></p>
    <div class="ag-more" hidden><p class="sub">${esc(g.blurb)}</p><ol class="ag-stages">${stages}</ol></div>
  </li>`;
}

export default {
  id: 'milestones',
  create({ sim }) {
    const s = sim.state;
    let open = false, built = false, dirty = true, acc = 0, tab = 'all', seen = readSeen();

    const btn = document.createElement('button');
    btn.className = 'ib achvib'; btn.id = 'achvbtn';
    btn.setAttribute('aria-label', 'Milestones and achievements'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = BUTTON_SVG + '<i class="dot" aria-hidden="true" hidden></i>';
    ($('goalsbtn') || $('settingsbtn')).before(btn);

    const card = document.createElement('aside');
    card.id = 'achv'; card.className = 'card'; card.dataset.mo = ''; card.hidden = true;
    card.setAttribute('aria-label', 'Milestones and achievements');
    card.innerHTML = `<button class="x" id="achx" type="button" aria-label="Close">${CLOSE_SVG}</button>
      <div class="band"><h2 class="h-disp">Milestones</h2><div class="sub" id="achsub"></div><div class="meter wide" role="img" aria-label="Stages reached"><i id="achbar"></i></div></div>
      <div class="achtabs" id="achtabs" role="tablist" aria-label="Goal groups"></div>
      <div class="achbody" id="achbody"></div>`;
    $('app').appendChild(card);

    const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };

    function build() {
      built = true;
      const tabs = [{ id: 'all', name: 'All' }, ...GROUPS];
      $('achtabs').innerHTML = tabs.map((t) => `<button type="button" role="tab" class="achtab" data-tab="${t.id}" aria-selected="${t.id === tab}">${esc(t.name)}</button>`).join('');
      $('achbody').innerHTML = `<section class="agroup" data-group="near"><h3>Almost there</h3><ul class="aglist" id="achnear"></ul></section>` +
        GROUPS.map((gr) => `<section class="agroup" data-group="${gr.id}"><h3>${esc(gr.name)} <small data-count></small></h3><p class="sub">${esc(gr.blurb)}</p><ul class="aglist">${GOALS.filter((g) => g.group === gr.id).map(goalHtml).join('')}</ul></section>`).join('');
      $('achtabs').onclick = (e) => {
        const b = e.target.closest('.achtab');
        if (!b) return;
        tab = b.dataset.tab; dirty = true; $('achbody').scrollTop = 0;
      };
      // A row under "Almost there" opens its goal in its own group.
      const jump = (li) => {
        tab = li.dataset.group; paint(); $('achbody').scrollTop = 0;
        const goal = $('achbody').querySelector(`.ag[data-goal="${li.dataset.goal}"]`);
        if (!goal) return;
        goal.querySelector('.ag-more').hidden = false; goal.querySelector('.ag-head').setAttribute('aria-expanded', 'true');
        goal.scrollIntoView({ block: 'nearest' });
      };
      $('achbody').onkeydown = (e) => { const li = e.target.closest && e.target.closest('.near'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); jump(li); } };
      $('achbody').onclick = (e) => {
        const near = e.target.closest('.near');
        if (near) { jump(near); return; }
        const head = e.target.closest('.ag-head');
        if (!head) return;
        const more = head.closest('.ag').querySelector('.ag-more'), on = more.hidden;
        more.hidden = !on; head.setAttribute('aria-expanded', String(on));
      };
    }

    function paintGoal(li, g) {
      const st = standing(s, g);
      const top = st.done ? STAGES[st.done - 1].color : '';
      if (li.style.getPropertyValue('--mc') !== top) li.style.setProperty('--mc', top);
      li.classList.toggle('complete', st.complete);
      li.classList.toggle('started', st.done > 0);
      const single = g.tiers.length === 1 && g.stageText;
      set(li.querySelector('.ag-prog'), st.complete ? (single ? 'Seen' : 'Complete') : single ? 'Not yet' : fmtCompact(Math.min(st.value, st.next)) + ' of ' + fmtCompact(st.next));
      li.querySelector('.meter i').style.width = pct(st.frac) + '%';
      li.querySelectorAll('.ag-pips i').forEach((p, i) => p.classList.toggle('on', i < st.done));
      li.querySelectorAll('.ag-stages li').forEach((row, i) => {
        row.classList.toggle('done', i < st.done);
        row.classList.toggle('next', i === st.done);
      });
      set(li.querySelector('.ag-next'), st.complete
        ? 'Every stage is done. Thank you for the town.'
        : 'Next, ' + STAGES[st.done].name + ': ' + fmtTarget(g, st.next) + ' · ' + rewardLine(rewardFor(g, st.done + 1), unlockFor(g, st.done + 1), roadName));
    }

    function paint() {
      const sum = summary(s);
      set($('achsub'), sum.stages + ' of ' + sum.totalStages + ' stages · ' + sum.goalsComplete + ' of ' + sum.totalGoals + ' goals complete');
      $('achbar').style.width = pct(sum.stages / sum.totalStages) + '%';
      $('achtabs').querySelectorAll('.achtab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      card.querySelectorAll('.agroup').forEach((sec) => {
        const id = sec.dataset.group;
        sec.hidden = id === 'near' ? tab !== 'all' : !(tab === 'all' || tab === id);
        if (sec.hidden || id === 'near') return;
        const list = GOALS.filter((g) => g.group === id);
        let done = 0, total = 0;
        for (const g of list) { const st = standing(s, g); done += st.done; total += st.total; paintGoal(sec.querySelector(`[data-goal="${g.id}"]`), g); }
        set(sec.querySelector('[data-count]'), done + ' of ' + total);
      });
      if (tab === 'all') {
        // Three goals closest to their next stage. Rebuilt only when the set changes, so a click never lands on a moving row.
        const near = nearest(s, 3), sig = near.map((n) => n.goal.id + n.done).join();
        const ul = $('achnear');
        if (ul.dataset.sig !== sig) {
          ul.dataset.sig = sig;
          ul.innerHTML = near.map((n) => `<li class="near" data-goal="${n.goal.id}" data-group="${n.goal.group}" tabindex="0" role="button"><b>${esc(n.goal.name)}</b><span class="meter wide"><i style="width:${pct(n.frac)}%"></i></span><small>${esc(fmtCompact(Math.min(n.value, n.next)) + ' of ' + fmtCompact(n.next))}</small></li>`).join('');
        } else ul.querySelectorAll('.near').forEach((li, i) => { li.querySelector('i').style.width = pct(near[i].frac) + '%'; });
      }
    }

    function paintDot() {
      const fresh = summary(s).stages > seen && !open;
      const dot = btn.querySelector('.dot');
      if (dot.hidden === fresh) dot.hidden = !fresh;
    }

    function toggle(force) {
      open = force === undefined ? !open : force;
      if (open && !built) build();
      card.hidden = !open;
      $('app').classList.toggle('achv-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-pressed', String(open));
      seen = summary(s).stages; writeSeen(seen);
      dirty = true;
    }

    btn.onclick = () => toggle();
    $('achx').onclick = () => toggle(false);
    addEventListener(OPEN_EVENT, () => toggle(true));

    return {
      frame(dt) {
        acc += dt;
        if (acc < 0.5 && !dirty) return;
        acc = 0; dirty = false;
        if (open) { paint(); seen = Math.max(seen, summary(s).stages); }
        paintDot();
      },
      onEvent(e) {
        if (e.type === 'milestone' || e.type === 'renewed' || e.type === 'changed') dirty = true;
      },
      onKey(e) {
        if (e.key === 'm' || e.key === 'M') { toggle(); return true; }
        if (e.key === 'Escape' && open) { toggle(false); return true; }
        return false;
      },
    };
  },
};
