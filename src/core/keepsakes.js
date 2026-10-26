// Keepsakes: playing on a real-world holiday gives the town a decoration to keep (nate's pick: events follow the game
// calendar, and the real date adds a little gift). Pure: the date comes in as milliseconds (sim.now()), read in the
// player's own time zone. No network, nothing to miss: a keepsake comes back every year it is played.
export const KEEPSAKES = [
  { id: 'snowglobe', event: 'christmas', name: 'Snow globe', months: [11], days: [1, 31], when: 'December' },
  { id: 'lanternpost', event: 'halloween', name: "Jack-o'-lantern post", months: [9], days: [1, 31], when: 'October' },
  { id: 'summerbell', event: 'july4', name: 'Summer bell', months: [6], days: [1, 7], when: 'the Fourth of July week' },
];

// The keepsakes whose real-world window holds this moment.
export function keepsakesOn(ms) {
  if (!Number.isFinite(ms)) return [];
  const d = new Date(ms), m = d.getMonth(), day = d.getDate();
  return KEEPSAKES.filter((k) => k.months.includes(m) && day >= k.days[0] && day <= k.days[1]);
}

export const sanitizeKeepsakes = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((id) => KEEPSAKES.some((k) => k.id === id)))] : []);
