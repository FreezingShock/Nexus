// Drawn icons for the town's pages and the menu rows, in the same hand as the title screen's (src/ui/title-icons.js):
// ink outline, warm fills, 28 by 28. Ours alone, drawn for Nexus.
import { ICONS, GROUP_ICONS } from './title-icons.js';

const svg = (body) => `<svg viewBox="0 0 28 28" fill="none" stroke="#2B2620" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const PAGE_ICONS = {
  // a pennant on a pole over a little hill
  goals: svg('<path d="M3.5 25c3-3 7-4.2 10.5-4.2S21.5 22 24.5 25Z" fill="#A8C179"/><path d="M9 22V4"/><path d="M9 5h13l-3.4 4.4L22 13.8H9Z" fill="#E6BC62"/>'),
  // a medal on a ribbon with a star
  milestones: svg('<path d="M9 3.5l3.5 9M19 3.5l-3.5 9" stroke-width="2.2"/><path d="M8 3.5h4l2 5 2-5h4" fill="#B8472E" stroke-width="1.4"/><circle cx="14" cy="18" r="7.5" fill="#E6BC62"/><path d="M14 13.8l1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2-2 2.8-.4Z" fill="#FBF6EA" stroke-width="1.3"/>'),
  // a sun half behind a cloud, with a crescent moon
  sky: svg('<circle cx="11" cy="11" r="4.6" fill="#E6BC62"/><path d="M11 3v1.8M3 11h1.8M5.3 5.3l1.3 1.3M16.7 5.3l-1.3 1.3"/><path d="M9.5 23.5h11.5a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.4 1A3.6 3.6 0 0 0 9.5 23.5Z" fill="#FBF6EA"/><path d="M24.5 5.5a3.6 3.6 0 0 1-4.6 4.6 3.8 3.8 0 1 0 4.6-4.6Z" fill="#C9D3E8" stroke-width="1.5"/>'),
  // a paint roller with a stripe of terracotta
  paint: svg('<rect x="4" y="4.5" width="16" height="7" rx="2" fill="#E6BC62"/><path d="M20 8h3v5.5H14V17"/><rect x="12" y="17" width="4" height="7.5" rx="1.2" fill="#C96F4F"/><path d="M6.5 8h7" stroke="#FBF6EA" stroke-width="1.6"/>'),
  // an old camera with a flash
  photo: svg('<path d="M4.5 9.5h4l1.8-3h7.4l1.8 3h4a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 3 22V11a1.5 1.5 0 0 1 1.5-1.5Z" fill="#E8D9EC"/><circle cx="14" cy="16" r="4.4" fill="#FBF6EA"/><circle cx="14" cy="16" r="1.8" fill="#35566A" stroke-width="1.2"/><rect x="5.5" y="11.5" width="3" height="2" rx=".5" fill="#E6BC62" stroke-width="1.2"/>'),
  // a key cap with a question mark
  shortcuts: svg('<rect x="4" y="5" width="20" height="18" rx="4" fill="#DCE8EC"/><path d="M4 18.5c0 2.5 1.8 4.5 4 4.5h12c2.2 0 4-2 4-4.5" fill="#B9CDD6"/><path d="M11.3 10.5a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9" stroke-width="2.2"/><circle cx="14" cy="18" r=".6" fill="#2B2620" stroke-width="1.6"/>'),
  settings: ICONS.settings,
  // a little picture frame (Graphics)
  gfx: svg('<rect x="4" y="5" width="20" height="17" rx="2" fill="#FBF6EA"/><path d="M4 18l5.5-5.5 4 4 3-3L24 21" fill="#A8C179"/><circle cx="18.5" cy="9.5" r="2" fill="#E6BC62"/>'),
  // a speaker with two waves (Sound)
  snd: svg('<path d="M4.5 11v6h4l5.5 4.5v-15L8.5 11Z" fill="#E3A08E"/><path d="M18 10.5a5 5 0 0 1 0 7M21 7.5a9 9 0 0 1 0 13"/>'),
  // a house with a key (Town and saves)
  town: GROUP_ICONS.town,
  // a stack of three medals (every milestone)
  all: svg('<circle cx="9" cy="17" r="5.5" fill="#E3A08E"/><circle cx="19" cy="17" r="5.5" fill="#A8C179"/><circle cx="14" cy="10.5" r="5.5" fill="#E6BC62"/>'),
};

export { GROUP_ICONS };
