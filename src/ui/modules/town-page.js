// "My town": the notebook page the town plaque opens (top left). Overview has the town from above, what it holds and how
// it is doing; Name and badge is the only place the town is renamed or its badge changed; Mayor shows the profile kept in
// this browser. Words and markup are pure in src/ui/town-view.js. Sends renameTown and setTownBadge.
import { book } from '../book.js';
import { PAGE_ICONS, GROUP_ICONS } from '../page-icons.js';
import { ICONS, EMBLEM_ICONS } from '../title-icons.js';
import { esc } from '../cards.js';
import { modelById } from '../../world/models.js';
import { cleanName } from '../../sim/town.js';
import { summary } from '../../sim/achievements.js';
import { MOOD } from '../../sim/services-config.js';
import { rankFor, initials, playTime } from '../../core/profile.js';
import { longDate, townDays } from '../date-text.js';
import { fmtExact } from '../format.js';
import { TOWN_TABS_DEF, badgeHtml, mayorHtml, moodWord, overviewHtml, plaqueLine, townCounts, townMapSvg, townSize } from '../town-view.js';

const TAB_ICONS = { overview: GROUP_ICONS.town, badge: GROUP_ICONS.districts, mayor: ICONS.profile };
export const TOWN_TABS = TOWN_TABS_DEF.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }));
const catOf = (model) => { const m = modelById(model); return m ? m.cat : 'home'; };

export default {
  id: 'town-page',
  create({ sim, send, profile }) {
    const s = sim.state, plaque = document.getElementById('townplaque');
    const pp = sim.population;
    const isOpen = () => book.current() === 'mytown';
    let shown = '', acc = 0;

    function overview() {
      const people = pp ? pp.people() : 0;
      return overviewHtml({
        town: s.town, size: townSize(people), dateLong: longDate(s), day: townDays(s),
        people, capacity: pp ? pp.capacity() : 0, coinsRate: sim.rate(), partsRate: sim.partsRate(),
        mood: moodWord(sim.services ? sim.services.average() : MOOD.base),
        counts: townCounts(s.placed, catOf, sim.grid, s.lots),
        map: townMapSvg(sim.grid, s.placed, catOf), districts: (s.districts || []).length,
      });
    }
    function mayor() {
      const store = typeof profile === 'function' ? profile() : profile;
      if (!store) return '<p class="pg-soft">The mayor profile is not ready yet.</p>';
      const p = store.get(), st = summary(s);
      const pic = p.emblem !== 'initials' && EMBLEM_ICONS[p.emblem] ? EMBLEM_ICONS[p.emblem] : `<span class="pf-init">${esc(initials(p.name)) || '?'}</span>`;
      return mayorHtml(p, rankFor(Math.max(p.bestStages, st.stages)), pic, [
        [playTime(p.playMs), 'played'], [fmtExact(p.popRecord), 'population record'], [fmtExact(st.stages), 'badge stages here'],
      ]);
    }

    book.register('mytown', {
      title: 'My town', c: '#E6BC62', icon: PAGE_ICONS.town, tabs: TOWN_TABS,
      sub: () => plaqueLine({ people: pp ? pp.people() : 0, year: s.year }),
      render({ tab }) {
        const html = tab === 'badge' ? badgeHtml(s.town) : tab === 'mayor' ? mayor() : overview();
        if (tab === 'overview') shown = html;
        return html;
      },
      click(e) {
        if (e.target.closest('[data-act="badge"]')) return book.pickTab('badge');
        const ic = e.target.closest('[data-icon]'), col = e.target.closest('[data-color]');
        if (!ic && !col) return;
        send({ type: 'setTownBadge', icon: ic ? ic.dataset.icon : undefined, color: col ? col.dataset.color : undefined });
        book.refresh();
      },
      // The name saves as it is typed. Only the preview changes, so the field keeps its focus and caret.
      input(e) {
        if (e.target.id !== 'tw-name') return;
        const name = cleanName(e.target.value);
        if (name && name !== s.town.name) send({ type: 'renameTown', name });
        const prev = book.body().querySelector('.tw-plaque b');
        if (prev) prev.textContent = s.town.name;
      },
    });

    if (plaque) {
      plaque.addEventListener('click', () => book.toggle('mytown'));
      plaque.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); book.toggle('mytown'); } });
    }

    return {
      // While Overview is open, its numbers and map follow the town every two seconds (only when something changed).
      frame(dt) {
        acc += dt;
        if (acc < 2 || !isOpen() || book.tab() !== 'overview') return;
        acc = 0;
        if (overview() !== shown) book.refresh();
        book.setSub(plaqueLine({ people: pp ? pp.people() : 0, year: s.year }));
      },
    };
  },
};
