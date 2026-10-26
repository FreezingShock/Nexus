// Small ink-outline glyphs for the festivals and the market, drawn inline in the game's style (24 x 24, no fonts or emoji).
const S = 'fill="none" stroke="#2B2620" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"';
const svg = (inner, size) => `<svg class="hico" width="${size}" height="${size}" viewBox="0 0 24 24" ${S} aria-hidden="true">${inner}</svg>`;

const GLYPHS = {
  newyear: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" fill="#E6BC62"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="#F3E7D0"/>',
  thaw: '<path d="M12 3.5c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0c0-3 2-5.5 5-9.5z" fill="#8FB8D6"/><path d="M10 14.5a2.2 2.2 0 0 0 2 2" />',
  blossom: '<circle cx="12" cy="12" r="2.2" fill="#E6BC62"/><circle cx="12" cy="6.4" r="3" fill="#E3A08E"/><circle cx="17.3" cy="10.2" r="3" fill="#E3A08E"/><circle cx="15.3" cy="16.4" r="3" fill="#E3A08E"/><circle cx="8.7" cy="16.4" r="3" fill="#E3A08E"/><circle cx="6.7" cy="10.2" r="3" fill="#E3A08E"/><circle cx="12" cy="12" r="2.2" fill="#E6BC62"/>',
  midsummer: '<circle cx="12" cy="12" r="4.2" fill="#E6BC62"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  harvest: '<path d="M12 21V9"/><path d="M12 9c-3 0-4.5-2-4.5-4.5C10 4.5 12 6 12 9zM12 9c3 0 4.5-2 4.5-4.5C14 4.5 12 6 12 9z" fill="#E6BC62"/><path d="M12 15c-3 0-4.5-2-4.5-4.5C10 10.5 12 12 12 15zM12 15c3 0 4.5-2 4.5-4.5C14 10.5 12 12 12 15z" fill="#D9895E"/>',
  lantern: '<path d="M12 2.5v3M8.5 5.5h7"/><rect x="7" y="5.5" width="10" height="12" rx="4.5" fill="#D9895E"/><path d="M12 5.5v12M9.5 18v2.5M14.5 18v2.5"/>',
  july4: '<path d="M5 21V3.5"/><path d="M5 4.5h14v9H5z" fill="#F7F1E3"/><path d="M5 7.5h14M5 10.5h14" stroke="#E0533F"/><path d="M5 4.5h6.5v5H5z" fill="#4E7FC4"/><path d="M5 4.5h14v9H5z"/>',
  halloween: '<path d="M12 6.5c-1-2 0-3.5 1.6-3.8"/><path d="M12 6.5c4.8-.6 8 2.6 8 7s-3.4 7-8 7-8-2.6-8-7 3.2-7.6 8-7z" fill="#E07B39"/><path d="M12 6.8c-1.8 2-1.8 11.4 0 13.6M12 6.8c1.8 2 1.8 11.4 0 13.6"/><path d="M8.2 12.2l1.6-1.4 1 1.6zM15.8 12.2l-1.6-1.4-1 1.6z" fill="#2B2620"/>',
  christmas: '<path d="M12 2.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#E6BC62"/><path d="M12 7.5l4 5h-2l4.5 5.5h-13L10 12.5H8z" fill="#5FA86A"/><path d="M10.5 18v3h3v-3"/><circle cx="10" cy="15.5" r=".9" fill="#E0533F" stroke="none"/><circle cx="14.2" cy="14.4" r=".9" fill="#F6D27A" stroke="none"/>',
  nye: '<path d="M12 12L12 4M12 12l5.7-5.7M12 12h8M12 12l5.7 5.7M12 12v8M12 12l-5.7 5.7M12 12H4M12 12L6.3 6.3"/><circle cx="12" cy="12" r="2.2" fill="#E6BC62"/><circle cx="12" cy="3.5" r="1" fill="#E0533F"/><circle cx="20.5" cy="12" r="1" fill="#6FA0DC"/><circle cx="12" cy="20.5" r="1" fill="#5FA86A"/><circle cx="3.5" cy="12" r="1" fill="#E6BC62"/>',
  firstsnow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.5 4.5L12 7l2.5-2.5"/>',
  market: '<path d="M4 9.5L6 4h12l2 5.5z" fill="#B8472E"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" fill="#FBF6EA"/><path d="M5.5 12.2V20h13v-7.8M9 20v-4h6v4"/>',
};
export const iconFor = (id, size = 16) => (GLYPHS[id] ? svg(GLYPHS[id], size) : '');
