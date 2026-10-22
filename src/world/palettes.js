// Four district palettes: they change roof and accent only, so the town reads as one place.
export const PAL = {
  warm:   { name: 'Warm',   wall: '#EAE1D5', roof: 0x97553E, accent: 0xE9C1B8 },
  pastel: { name: 'Pastel', wall: '#E9C1B8', roof: 0xB88A7A, accent: 0xBFD8C4 },
  slate:  { name: 'Slate',  wall: '#F2E4D2', roof: 0x6B6B5A, accent: 0xCBC3DC },
  green:  { name: 'Green',  wall: '#BFD8C4', roof: 0x7D8A5E, accent: 0xEBD9A0 },
  // Paint colours the player can buy for a building's walls (src/world/paint.js). Districts never pick these on their own.
  butter: { name: 'Butter', wall: '#F0DDA0', roof: 0x97553E, accent: 0xD98C7A },
  rose:   { name: 'Rose',   wall: '#E8B4B8', roof: 0x8A5A4E, accent: 0xFAF3E4 },
  sage:   { name: 'Sage',   wall: '#B5C99A', roof: 0x7D8A5E, accent: 0xF0DDA0 },
  sky:    { name: 'Sky',    wall: '#BCD3E0', roof: 0x6B6B5A, accent: 0xFAF3E4 },
  lilac:  { name: 'Lilac',  wall: '#CFC3E0', roof: 0x6E5A78, accent: 0xEBD9A0 },
  brick:  { name: 'Brick',  wall: '#C9805F', roof: 0x4F4A44, accent: 0xFAF3E4 },
  plum:   { name: 'Plum',   wall: '#A98098', roof: 0x4F4A44, accent: 0xF0DDA0 },
  teal:   { name: 'Teal',   wall: '#8DBDB4', roof: 0x6B6B5A, accent: 0xF0DDA0 },
};
// Roof colours the player can pick instead of the palette's own.
export const ROOFS = {
  tile:   { name: 'Clay tile', hex: 0xB8472E },
  slate:  { name: 'Slate',     hex: 0x5E6470 },
  rose:   { name: 'Rose',      hex: 0xD98C7A },
  moss:   { name: 'Moss',      hex: 0x6F8A57 },
  plum:   { name: 'Plum',      hex: 0x7A5470 },
  ochre:  { name: 'Ochre',     hex: 0xC99A3E },
  harbour:{ name: 'Harbour',   hex: 0x6E94B0 },
  copper: { name: 'Verdigris', hex: 0x5E9C8A },
};
export const AWNINGS = [0xD98C7A, 0xEBD9A0, 0xBFD8C4];
export const TREE_COLORS = [0xA0B873, 0x9DB37C, 0x7D8A5E, 0xA0B873, 0xD9A25F];
export const PINE_COLORS = [0x5D6A48, 0x4F5B3F, 0x6B7A4F];
export const CAR_COLORS = [0xE9C1B8, 0xBFD8C4, 0xEBD9A0, 0xCBC3DC, 0xD98C7A, 0xFAF3E4];
// Crops for the fields: a ground colour and a colour for the rows. The season shifts both (render/season.js).
export const CROPS = [
  { name: 'wheat', base: '#E2C27A', row: '#C49A4E' },
  { name: 'barley', base: '#D8D08C', row: '#B0AA66' },
  { name: 'greens', base: '#93B36C', row: '#6F9650' },
  { name: 'tilled', base: '#C9A97F', row: '#A6845C' },
];
