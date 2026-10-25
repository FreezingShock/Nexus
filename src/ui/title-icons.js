// Drawn icons for the title screen: the card's rows, the page headers, the changelog kinds and the How to play steps.
// Inline SVG strings in the Nexus hand: ink outline, warm fills. Ours alone, drawn for Nexus.
const svg = (body, vb = 28) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="#2B2620" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // an open book with a ribbon
  howto: svg('<path d="M14 7.5C11 5.5 7 5.2 3.5 6v15.5c3.5-.8 7.5-.5 10.5 1.5 3-2 7-2.3 10.5-1.5V6C21 5.2 17 5.5 14 7.5Z" fill="#FBF6EA"/><path d="M14 7.5V23"/><path d="M18.5 6.2v7l1.8-1.4 1.8 1.4V6" fill="#B8472E" stroke-width="1.5"/><path d="M6.5 10.5c1.8-.3 3.6 0 5 .7M6.5 14c1.8-.3 3.6 0 5 .7"/>'),
  // a rolled scroll with a star
  changes: svg('<path d="M7 5h14a2.5 2.5 0 0 1 0 5H19v12.5a2.5 2.5 0 0 1-2.5 2.5H6" fill="#FBF6EA"/><path d="M7 5a2.5 2.5 0 0 0-2.5 2.5V22.5A2.5 2.5 0 0 0 7 25h9.5"/><path d="M11.8 11.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3Z" fill="#E6BC62" stroke-width="1.4"/><path d="M8.5 21h7"/>'),
  // a heart with a little stitch
  credits: svg('<path d="M14 24C6 18 4 14 4 10.5A5.5 5.5 0 0 1 14 8a5.5 5.5 0 0 1 10 2.5C24 14 22 18 14 24Z" fill="#E3A08E"/><path d="M8.5 11.5a2.6 2.6 0 0 1 2.6-2.2" stroke="#FBF6EA" stroke-width="1.6"/>'),
  // a cog
  settings: svg('<path d="M12.2 3.5h3.6l.6 3 2.2 1.2 2.9-1 1.8 3.1-2.3 2v2.4l2.3 2-1.8 3.1-2.9-1-2.2 1.2-.6 3h-3.6l-.6-3-2.2-1.2-2.9 1-1.8-3.1 2.3-2v-2.4l-2.3-2 1.8-3.1 2.9 1 2.2-1.2Z" fill="#DCE8EC"/><circle cx="14" cy="14" r="3.6" fill="#FBF6EA"/>'),
  // a seedling in a mound
  new: svg('<path d="M4.5 24.5c2.5-3.2 6-4.6 9.5-4.6s7 1.4 9.5 4.6Z" fill="#C9A27A"/><path d="M14 20V12"/><path d="M14 13.5C14 9.5 11 7.5 6.5 8c0 4 2.8 6 7.5 5.5Z" fill="#A8C179"/><path d="M14 12c0-3.6 2.6-5.8 7-5.5.2 3.8-2.4 6-7 5.5Z" fill="#A8C179"/>'),
  // a mayor's top hat with a sash band
  profile: svg('<path d="M3.5 21.5c3 2 18 2 21 0" fill="#3B352D"/><path d="M8.5 21V7.5c0-1.4 11-1.4 11 0V21c-2.5 1-8.5 1-11 0Z" fill="#3B352D"/><path d="M8.5 16.5c2.5 1 8.5 1 11 0v2.6c-2.5 1-8.5 1-11 0Z" fill="#B8472E"/><circle cx="17.5" cy="17.6" r="1.2" fill="#E6BC62" stroke-width="1.1"/>'),
  // a lantern with a warm flame
  pass: svg('<path d="M11 5.5h6M12 5.5V3.5h4v2"/><path d="M9 8.5h10l-1.2 13h-7.6Z" fill="#E6BC62"/><path d="M8 8.5h12M8 21.5h12"/><path d="M14 18.5c-1.8 0-2.6-1.4-2-3 .5-1.2 1.6-1.6 2-3.2.9 1.2 2.4 2.4 2 4.4-.2 1.1-.9 1.8-2 1.8Z" fill="#D2603F" stroke-width="1.4"/><path d="M10 24.5h8"/>'),
  close: svg('<path d="M8 8l12 12M20 8L8 20" stroke-width="2.6"/>'),
  back: svg('<path d="M16.5 7.5L10 14l6.5 6.5" stroke-width="2.6"/>'),
};

// The changelog kinds, small.
export const KIND_ICONS = {
  new: svg('<path d="M14 4l2.4 6.6L23 13l-6.6 2.4L14 22l-2.4-6.6L5 13l6.6-2.4Z" fill="#FBF6EA"/>'),
  better: svg('<path d="M14 23V7M7.5 13.5L14 7l6.5 6.5" stroke-width="2.6"/>'),
  look: svg('<path d="M20.5 4.5l3 3-9.5 9.5-3-3Z" fill="#FBF6EA"/><path d="M11 14c-3 0-5 2-5 4.5 0 2-1 3-2.5 3.5 4.5 1.5 10.5.5 10.5-5Z" fill="#B8472E"/>'),
  sound: svg('<path d="M11 20V6.5l11-2.5V17.5"/><circle cx="8" cy="20" r="3" fill="#FBF6EA"/><circle cx="19" cy="17.5" r="3" fill="#FBF6EA"/>'),
  fix: svg('<path d="M18.5 4a5.5 5.5 0 0 0-5.2 7.3L4.8 19.8a2.1 2.1 0 0 0 3 3l8.5-8.5A5.5 5.5 0 0 0 23.5 9l-3.3 3.3-3-.5-.5-3Z" fill="#FBF6EA"/>'),
};

// The five steps of How to play.
export const STEP_ICONS = {
  look: svg('<circle cx="14" cy="14" r="9.5" fill="#DCE8EC"/><path d="M14 6.5l2.5 7.5-2.5 7.5-2.5-7.5Z" fill="#B8472E"/><circle cx="14" cy="14" r="1.4" fill="#FBF6EA"/>'),
  road: svg('<path d="M9 25L12 3h4l3 22Z" fill="#8A8173"/><path d="M14 6v3M14 12.5v3M14 19v3" stroke="#FBF6EA" stroke-width="1.8"/>'),
  zone: svg('<rect x="4" y="4" width="9" height="9" rx="1.5" fill="#A8C179"/><rect x="15" y="4" width="9" height="9" rx="1.5" fill="#8FB8D6"/><rect x="4" y="15" width="9" height="9" rx="1.5" fill="#E6BC62"/><rect x="15" y="15" width="9" height="9" rx="1.5" fill="#FBF6EA" stroke-dasharray="2.5 2"/>'),
  grow: svg('<path d="M5 13.5L14 5l9 8.5" fill="#97553E"/><rect x="7.5" y="13" width="13" height="11" fill="#FBF6EA"/><path d="M14 22v-6.5M11 18.5l3-3 3 3" stroke="#5F7A3E" stroke-width="2.2"/>'),
  away: svg('<rect x="3.5" y="7" width="21" height="15" rx="2" fill="#FBF6EA"/><path d="M3.5 8l10.5 8 10.5-8"/><circle cx="20.5" cy="18" r="3" fill="#B8472E" stroke-width="1.4"/>'),
};

// The mayor's emblems (src/core/profile.js EMBLEMS, besides initials). Drawn on a coloured disc, so fills stay light.
export const EMBLEM_ICONS = {
  hat: svg('<path d="M4 20.5c3 2 17 2 20 0" fill="#FBF6EA"/><path d="M8.5 20V8c0-1.4 11-1.4 11 0v12c-2.5 1-8.5 1-11 0Z" fill="#FBF6EA"/><path d="M8.5 15.5c2.5 1 8.5 1 11 0v2.4c-2.5 1-8.5 1-11 0Z" fill="#E6BC62"/>'),
  tulip: svg('<path d="M14 24V14"/><path d="M14 19c-3-.5-5-2.5-5.5-5 2.8.2 4.8 1.8 5.5 5Z" fill="#A8C179"/><path d="M8.5 6.5c0 5 2 7.5 5.5 7.5s5.5-2.5 5.5-7.5L17 9l-3-4-3 4Z" fill="#FBF6EA"/>'),
  lantern: svg('<path d="M11 5.5h6M12 5.5V3.5h4v2"/><path d="M9 8.5h10l-1.2 13h-7.6Z" fill="#FBF6EA"/><path d="M8 8.5h12M8 21.5h12"/><path d="M14 18.5c-1.8 0-2.6-1.4-2-3 .5-1.2 1.6-1.6 2-3.2.9 1.2 2.4 2.4 2 4.4-.2 1.1-.9 1.8-2 1.8Z" fill="#E6BC62" stroke-width="1.4"/>'),
  bicycle: svg('<circle cx="7.5" cy="18" r="4.5" fill="#FBF6EA"/><circle cx="20.5" cy="18" r="4.5" fill="#FBF6EA"/><path d="M7.5 18l4-8h7l2 8M11.5 10l3 8h-7M10 7.5h3.5M18.5 10l-1-3h2.5"/>'),
  teapot: svg('<path d="M7 12h13v5.5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5Z" fill="#FBF6EA"/><path d="M20 13.5c2.5-.5 4 1 3.5 3-.4 1.6-2 2.5-4 2.5M7 14.5L3.5 11.5"/><path d="M10 12c0-2 1.6-3.5 3.5-3.5S17 10 17 12" fill="#E6BC62"/><circle cx="13.5" cy="7.5" r="1.2" fill="#FBF6EA"/>'),
  key: svg('<circle cx="9" cy="14" r="5" fill="#FBF6EA"/><circle cx="9" cy="14" r="1.8"/><path d="M14 14h11M21 14v3.5M24 14v2.5"/>'),
  sheep: svg('<path d="M8 12.5a3 3 0 0 1 4.5-3 3 3 0 0 1 5 0 3 3 0 0 1 4 3.2 3 3 0 0 1-1 5.3 3 3 0 0 1-4.5 1.5 3 3 0 0 1-4.5 0 3 3 0 0 1-4-2.5A3 3 0 0 1 8 12.5Z" fill="#FBF6EA"/><path d="M11 20v3.5M18 20v3.5"/><ellipse cx="6.5" cy="13.5" rx="2.5" ry="2" fill="#3B352D"/>'),
  oak: svg('<path d="M14 24v-6"/><path d="M14 19c-6 0-9.5-3-9-7 .3-2.5 2.5-3.5 4-3.2C9.5 5.5 12 4 14 4s4.5 1.5 5 4.8c1.5-.3 3.7.7 4 3.2.5 4-3 7-9 7Z" fill="#A8C179"/><circle cx="17.5" cy="13" r="1.4" fill="#C08A2E" stroke-width="1.2"/>'),
};

// One icon per milestone group (src/sim/achievements.js GROUPS), for the profile's badges.
export const GROUP_ICONS = {
  town: svg('<path d="M5 13.5L14 5l9 8.5" fill="#97553E"/><rect x="7.5" y="13" width="13" height="11" fill="#FBF6EA"/><rect x="12" y="17" width="4" height="7" fill="#B8472E" stroke-width="1.5"/>'),
  money: svg('<circle cx="14" cy="14" r="9.5" fill="#E6BC62"/><circle cx="14" cy="14" r="6.5"/><path d="M14 10.5v7M12 12.5h3.5a1.5 1.5 0 0 1 0 3H12" stroke-width="1.6"/>'),
  roads: STEP_ICONS.road,
  zones: STEP_ICONS.zone,
  services: svg('<rect x="4.5" y="4.5" width="19" height="19" rx="4" fill="#FBF6EA"/><path d="M14 8.5v11M8.5 14h11" stroke="#B8472E" stroke-width="3.2"/>'),
  farms: svg('<path d="M14 25V8"/><path d="M14 9c-2-1-3-3-2.5-5 2 .5 3 2.5 2.5 5ZM14 9c2-1 3-3 2.5-5-2 .5-3 2.5-2.5 5ZM14 14c-2.5-.5-4-2.5-3.8-4.8 2.4.3 3.8 2.2 3.8 4.8ZM14 14c2.5-.5 4-2.5 3.8-4.8-2.4.3-3.8 2.2-3.8 4.8ZM14 19c-2.5-.5-4-2.5-3.8-4.8 2.4.3 3.8 2.2 3.8 4.8ZM14 19c2.5-.5 4-2.5 3.8-4.8-2.4.3-3.8 2.2-3.8 4.8Z" fill="#E6BC62" stroke-width="1.4"/>'),
  districts: svg('<path d="M3.5 25Q10 19.5 16 22T25 25Z" fill="#A8C179"/><path d="M9 24V4.5"/><path d="M9 5.5h14l-3.6 4.5 3.6 4.5H9Z" fill="#C96F4F"/>'),
  seasons: svg('<path d="M14 24c-6.5 0-10-4.5-9.5-10.5C10.5 13 14 16 14 24Z" fill="#E6BC62"/><path d="M14 24c6.5 0 10-4.5 9.5-10.5C17.5 13 14 16 14 24Z" fill="#C96F4F"/><path d="M14 24C14 15 10 9 14 4c4 5 0 11 0 20Z" fill="#A8C179"/>'),
  renewal: svg('<path d="M22 11a8.5 8.5 0 1 0 .5 6" fill="none"/><path d="M23 5v6.5h-6.5" stroke-width="2.2"/><path d="M14 10.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4Z" fill="#E6BC62" stroke-width="1.3"/>'),
};
