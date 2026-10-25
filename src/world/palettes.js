// Four district palettes: they change roof and accent only, so the town reads as one place.
export const PAL = {
  warm:   { name: 'Warm',   wall: '#EAE1D5', roof: 0x97553E, accent: 0xE9C1B8 },
  pastel: { name: 'Pastel', wall: '#E9C1B8', roof: 0xB88A7A, accent: 0xBFD8C4 },
  slate:  { name: 'Slate',  wall: '#F2E4D2', roof: 0x6B6B5A, accent: 0xCBC3DC },
  green:  { name: 'Green',  wall: '#BFD8C4', roof: 0x7D8A5E, accent: 0xEBD9A0 },
  // Paint schemes the player can buy for a building's walls (src/world/paint.js): a wall colour with its own trim colour
  // (`accent`: doors, window frames, porch hoods). `two` marks a scheme whose trim contrasts on purpose. Districts never pick these.
  cream:      { name: 'Cream',      wall: '#F5ECD7', roof: 0x97553E, accent: 0xC96F4F },
  butter:     { name: 'Butter',     wall: '#F2DFA6', roof: 0xA0583E, accent: 0x4E7A6A, two: true },
  rose:       { name: 'Rose',       wall: '#EBB9BA', roof: 0x8A5A4E, accent: 0xFAF3E4 },
  sage:       { name: 'Sage',       wall: '#B8CC9E', roof: 0x7D8A5E, accent: 0xF4E7C0 },
  sky:        { name: 'Sky',        wall: '#BCD5E2', roof: 0x6B6B5A, accent: 0xFAF3E4 },
  terracotta: { name: 'Terracotta', wall: '#DA8F6E', roof: 0x5E6470, accent: 0xFAF3E4 },
  ochre:      { name: 'Ochre',      wall: '#E7BC6C', roof: 0x7A5440, accent: 0x3F5A78, two: true },
  olive:      { name: 'Olive',      wall: '#AEB77F', roof: 0x6B4E3A, accent: 0xF4E7C0 },
  lilac:      { name: 'Lilac',      wall: '#D1C6E2', roof: 0x6E5A78, accent: 0x6E5A78, two: true },
  denim:      { name: 'Denim',      wall: '#96B1CA', roof: 0x5E6470, accent: 0xE6BC62, two: true },
  chalk:      { name: 'Chalk',      wall: '#F7F2E8', roof: 0x4F4A44, accent: 0x4F4A44, two: true },
  mulberry:   { name: 'Mulberry',   wall: '#B97A8E', roof: 0x4F4A44, accent: 0xF4E7C0 },
  brick:      { name: 'Brick',      wall: '#C9805F', roof: 0x4F4A44, accent: 0xFAF3E4 },
  teal:       { name: 'Teal',       wall: '#8DBDB4', roof: 0x6B6B5A, accent: 0xF4E7C0 },
  plum:       { name: 'Plum',       wall: '#A98098', roof: 0x4F4A44, accent: 0xF0DDA0 },
  charcoal:   { name: 'Charcoal',   wall: '#6F6A64', roof: 0x4F4A44, accent: 0xE6BC62, two: true },
};
// Trim colours the player can pick instead of the scheme's own: doors, window frames, porch hoods, awnings' neighbours.
export const TRIMS = {
  cream:      { name: 'Cream',      hex: 0xFAF3E4 },
  terracotta: { name: 'Terracotta', hex: 0xC96F4F },
  forest:     { name: 'Forest',     hex: 0x4E6B52 },
  mustard:    { name: 'Mustard',    hex: 0xE6BC62 },
  rose:       { name: 'Rose',       hex: 0xD98C7A },
  sky:        { name: 'Sky',        hex: 0x9CC0D8 },
  brown:      { name: 'Walnut',     hex: 0x6B4E3A },
  navy:       { name: 'Navy',       hex: 0x3F5A78 },
  teal:       { name: 'Teal',       hex: 0x4E7A6A },
  plum:       { name: 'Plum',       hex: 0x7A5470 },
  charcoal:   { name: 'Charcoal',   hex: 0x4F4A44 },
};
// Roof colours the player can pick instead of the palette's own.
export const ROOFS = {
  tile:     { name: 'Clay tile', hex: 0xB8472E },
  slate:    { name: 'Slate',     hex: 0x5E6470 },
  rose:     { name: 'Rose',      hex: 0xD98C7A },
  umber:    { name: 'Umber',     hex: 0x6B4E3A },
  moss:     { name: 'Moss',      hex: 0x6F8A57 },
  sand:     { name: 'Sand',      hex: 0xD9C08E },
  plum:     { name: 'Plum',      hex: 0x7A5470 },
  forest:   { name: 'Forest',    hex: 0x4E6B52 },
  ochre:    { name: 'Ochre',     hex: 0xC99A3E },
  harbour:  { name: 'Harbour',   hex: 0x6E94B0 },
  copper:   { name: 'Verdigris', hex: 0x5E9C8A },
  navy:     { name: 'Navy',      hex: 0x3F5A78 },
};
export const AWNINGS = [0xD98C7A, 0xEBD9A0, 0xBFD8C4];
export const TREE_COLORS = [0xA0B873, 0x9DB37C, 0x7D8A5E, 0xA0B873, 0xD9A25F];
export const PINE_COLORS = [0x5D6A48, 0x4F5B3F, 0x6B7A4F];
// Crops for the fields: a ground colour and a colour for the rows. The season shifts both (render/season.js).
export const CROPS = [
  { name: 'wheat', base: '#E2C27A', row: '#C49A4E' },
  { name: 'barley', base: '#D8D08C', row: '#B0AA66' },
  { name: 'greens', base: '#93B36C', row: '#6F9650' },
  { name: 'tilled', base: '#C9A97F', row: '#A6845C' },
];
