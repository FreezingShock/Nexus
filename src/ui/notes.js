// Postcard-style notes for milestone and reward events. Only these event types get a note; the rest keep the toast.
const TYPES = {
  goalDone: { title: 'A goal is done', icon: 'star' },
  renewed: { title: 'A fresh start', icon: 'sprout' },
  boosted: { title: 'Charged up', icon: 'bolt' },
  firstSnow: { title: 'First snow', icon: 'sprout' },
};

export const NOTE_ICONS = {
  star: 'M12 3L14.6 9L21 9.5L16 13.7L17.6 20L12 16.6L6.4 20L8 13.7L3 9.5L9.4 9Z',
  sprout: 'M12 21V11M12 11C12 7 9 5 5 5C5 9 7 11 12 11ZM12 13C12 9.5 14.5 7.5 19 7.5C19 11.5 16.5 13 12 13Z',
  bolt: 'M13 3L5 14H11L10 21L19 9.5H13Z',
};

export function isNoteEvent(e) {
  return !!e && Object.prototype.hasOwnProperty.call(TYPES, e.type) && typeof e.text === 'string' && e.text.length > 0;
}

export function noteFor(e) {
  if (!isNoteEvent(e)) return null;
  const t = TYPES[e.type];
  return { title: t.title, icon: t.icon, text: e.text };
}
