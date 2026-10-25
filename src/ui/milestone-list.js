// The Milestones tab of the Goals page: every goal as a card with its medal, progress, stages and rewards, grouped and
// filtered by a row of chips. Markup is built once per draw and the numbers are painted in place, so an expanded goal
// stays open while its bar fills. Reads the sim state only: rewards are paid by the sim itself (systems/achievements.js).
import { GOALS, GROUPS, STAGES, fmtTarget, nearest, rewardFor, rewardLine, standing, summary, unlockFor } from '../sim/achievements.js';
import { ROAD_TYPES } from '../sim/catalog.js';
import { fmtCompact } from './format.js';
import { PAGE_ICONS, GROUP_ICONS } from './page-icons.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const roadName = (id) => { const t = ROAD_TYPES.find((r) => r.id === id); return t ? t.short : id; };
export const pct = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));
const MEDAL = '<svg class="ag-medal" width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 3L13.5 13M22 3L18.5 13" fill="none" stroke="#2B2620" stroke-width="2.2" stroke-linecap="round"/><circle class="disc" cx="16" cy="19" r="9" stroke="#2B2620" stroke-width="2.2"/><path class="spark" d="M16 14.2L17.4 17.2L20.6 17.6L18.2 19.8L18.9 23L16 21.4L13.1 23L13.8 19.8L11.4 17.6L14.6 17.2Z" fill="#FBF6EA" stroke="#2B2620" stroke-width="1.3" stroke-linejoin="round"/></svg>';
// A chip colour per group, from the warm palette.
const GROUP_COLORS = { town: '#F2C9BA', money: '#F6DDA0', roads: '#E4D5B2', zones: '#D3E4C4', services: '#D2E3EE', farms: '#EBD9A6', districts: '#C9DDB8', seasons: '#F0C4B6', renewal: '#E8D9EC' };

function goalHtml(g) {
  const stages = g.tiers.map((t, i) => {
    const r = rewardFor(g, i + 1);
    return `<li data-stage="${i}" style="--pc:${STAGES[i].color}"><i class="pip"></i><span class="st-name">${STAGES[i].name}</span><span class="st-target">${esc(fmtTarget(g, t))}</span><small class="st-reward">${esc(rewardLine(r, unlockFor(g, i + 1), roadName))}</small></li>`;
  }).join('');
  return `<li class="ag" data-goal="${g.id}">
    <button class="ag-head" type="button" aria-expanded="false">
      ${MEDAL}
      <span class="ag-main"><b class="ag-name">${esc(g.name)}</b><small class="ag-prog"></small></span>
      <span class="ag-pips" aria-hidden="true">${g.tiers.map((_, i) => `<i style="--pc:${STAGES[i].color}"></i>`).join('')}</span>
    </button>
    <div class="meter wide" role="img" aria-label="${esc(g.name)} progress"><i></i></div>
    <p class="ag-next"></p>
    <div class="ag-more" hidden><p class="sub">${esc(g.blurb)}</p><ol class="ag-stages">${stages}</ol></div>
  </li>`;
}

// One "almost there" row. Shared with the Today tab.
export const nearHtml = (n) => `<li class="near" data-goal="${n.goal.id}" data-group="${n.goal.group}" tabindex="0" role="button" style="--gc:${GROUP_COLORS[n.goal.group] || '#F3E7D0'}">
  <span class="near-ico">${GROUP_ICONS[n.goal.group] || ''}</span><span class="near-text"><b>${esc(n.goal.name)}</b><small>${esc(fmtTarget(n.goal, n.next))}</small></span>
  <span class="meter wide"><i style="width:${pct(n.frac)}%"></i></span><small class="near-n">${esc(fmtCompact(Math.min(n.value, n.next)) + ' of ' + fmtCompact(n.next))}</small></li>`;

// The tab's markup for one filter: 'all' or a group id.
export function milestonesHtml(s, filter) {
  const sum = summary(s);
  const chips = [{ id: 'all', name: 'All', icon: PAGE_ICONS.all, c: '#FBF6EA' }, ...GROUPS.map((g) => ({ id: g.id, name: g.name, icon: GROUP_ICONS[g.id], c: GROUP_COLORS[g.id] }))];
  const groups = GROUPS.filter((g) => filter === 'all' || g.id === filter);
  return `<section class="ms-top">
      <div class="ms-sum"><b class="h-disp" id="ms-stages">${sum.stages}</b><span>of ${sum.totalStages} stages<small id="ms-goals">${sum.goalsComplete} of ${sum.totalGoals} goals complete</small></span>
        <div class="meter wide ms-bar" role="img" aria-label="Stages reached"><i id="ms-bar" style="width:${pct(sum.stages / sum.totalStages)}%"></i></div></div>
      <div class="nb-chips ms-chips" data-k="ms-filter">${chips.map((c) => `<button class="nb-chip" type="button" data-v="${c.id}" style="--c:${c.c}" aria-pressed="${filter === c.id}"><i>${c.icon}</i>${esc(c.name)}</button>`).join('')}</div>
    </section>
    ${filter === 'all' ? `<section class="agroup" style="--i:1"><h3>Almost there</h3><ul class="nearlist" id="ms-near">${nearest(s, 3).map(nearHtml).join('')}</ul></section>` : ''}
    ${groups.map((gr, i) => `<section class="agroup" data-group="${gr.id}" style="--i:${i + 2};--gc:${GROUP_COLORS[gr.id]}"><h3><span class="ag-gico">${GROUP_ICONS[gr.id]}</span>${esc(gr.name)} <small data-count></small></h3><p class="sub">${esc(gr.blurb)}</p>
      <ul class="aglist">${GOALS.filter((g) => g.group === gr.id).map(goalHtml).join('')}</ul></section>`).join('')}`;
}

function paintGoal(li, s, g, set) {
  const st = standing(s, g);
  const top = st.done ? STAGES[st.done - 1].color : '';
  if (li.style.getPropertyValue('--mc') !== top) li.style.setProperty('--mc', top);
  li.classList.toggle('complete', st.complete);
  li.classList.toggle('started', st.done > 0);
  const single = g.tiers.length === 1 && g.stageText;
  set(li.querySelector('.ag-prog'), st.complete ? (single ? 'Seen' : 'Complete') : single ? 'Not yet' : fmtCompact(Math.min(st.value, st.next)) + ' of ' + fmtCompact(st.next));
  li.querySelector('.meter i').style.width = pct(st.frac) + '%';
  li.querySelectorAll('.ag-pips i').forEach((p, i) => p.classList.toggle('on', i < st.done));
  li.querySelectorAll('.ag-stages li').forEach((row, i) => { row.classList.toggle('done', i < st.done); row.classList.toggle('next', i === st.done); });
  set(li.querySelector('.ag-next'), st.complete
    ? 'Every stage is done. Thank you for the town.'
    : 'Next, ' + STAGES[st.done].name + ': ' + fmtTarget(g, st.next) + ' · ' + rewardLine(rewardFor(g, st.done + 1), unlockFor(g, st.done + 1), roadName));
}

// Paints the numbers into the drawn tab.
export function paintMilestones(root, s) {
  const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const sum = summary(s);
  set(root.querySelector('#ms-stages'), String(sum.stages));
  set(root.querySelector('#ms-goals'), sum.goalsComplete + ' of ' + sum.totalGoals + ' goals complete');
  const bar = root.querySelector('#ms-bar');
  if (bar) bar.style.width = pct(sum.stages / sum.totalStages) + '%';
  root.querySelectorAll('.agroup[data-group]').forEach((sec) => {
    let done = 0, total = 0;
    for (const g of GOALS.filter((x) => x.group === sec.dataset.group)) {
      const st = standing(s, g); done += st.done; total += st.total;
      const li = sec.querySelector(`[data-goal="${g.id}"]`);
      if (li) paintGoal(li, s, g, set);
    }
    set(sec.querySelector('[data-count]'), done + ' of ' + total);
  });
  // The three goals closest to their next stage. Redrawn only when the set changes, so a click never lands on a moving row.
  const ul = root.querySelector('#ms-near');
  if (ul) {
    const near = nearest(s, 3), sig = near.map((n) => n.goal.id + n.done).join();
    if (ul.dataset.sig !== sig) { ul.dataset.sig = sig; ul.innerHTML = near.map(nearHtml).join(''); }
    else ul.querySelectorAll('.near').forEach((li, i) => { li.querySelector('.meter i').style.width = pct(near[i].frac) + '%'; });
  }
}

// Opens a goal card's stage list (after a jump from an "almost there" row).
export function openGoal(root, id) {
  const goal = root.querySelector(`.ag[data-goal="${id}"]`);
  if (!goal) return;
  goal.querySelector('.ag-more').hidden = false;
  goal.querySelector('.ag-head').setAttribute('aria-expanded', 'true');
  goal.scrollIntoView({ block: 'center' });
}
