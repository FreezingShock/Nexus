// Postcard-style notes for milestone and reward events. Only these event types get a note; the rest keep the toast.
// A milestone event carries its own title ("Gold · Builder") and the colour of its stage for the stamp.
const TYPES = {
  goalDone: { title: 'A goal is done', icon: 'star' },
  renewed: { title: 'A fresh start', icon: 'sprout' },
  boosted: { title: 'Charged up', icon: 'bolt' },
  firstSnow: { title: 'First snow', icon: 'sprout' },
  milestone: { title: 'A milestone', icon: 'medal' },
};

export const NOTE_ICONS = {
  star: 'M12 3L14.6 9L21 9.5L16 13.7L17.6 20L12 16.6L6.4 20L8 13.7L3 9.5L9.4 9Z',
  sprout: 'M12 21V11M12 11C12 7 9 5 5 5C5 9 7 11 12 11ZM12 13C12 9.5 14.5 7.5 19 7.5C19 11.5 16.5 13 12 13Z',
  bolt: 'M13 3L5 14H11L10 21L19 9.5H13Z',
  medal: 'M8 3L10.5 9M16 3L13.5 9M12 8.5A5.5 5.5 0 1 1 11.99 8.5ZM12 12L12.9 13.9L15 14.2L13.5 15.6L13.9 17.7L12 16.7L10.1 17.7L10.5 15.6L9 14.2L11.1 13.9Z',
};

export function isNoteEvent(e) {
  return !!e && Object.prototype.hasOwnProperty.call(TYPES, e.type) && typeof e.text === 'string' && e.text.length > 0;
}

export function noteFor(e) {
  if (!isNoteEvent(e)) return null;
  const t = TYPES[e.type];
  const title = typeof e.title === 'string' && e.title ? e.title.slice(0, 60) : t.title;
  const tint = typeof e.tint === 'string' && /^#[0-9a-f]{6}$/i.test(e.tint) ? e.tint : null;
  return { title, icon: t.icon, text: e.text, tint };
}
