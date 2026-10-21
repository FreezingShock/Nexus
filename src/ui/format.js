export const $ = (id) => document.getElementById(id);
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
export const fmtRate = (r) => '+' + (Math.round(r * 10) / 10) + '/s';

// 24000 s -> "6 h 40 min"; under an hour -> "12 min"
export function fmtDuration(s) {
  const m = Math.round(s / 60), h = Math.floor(m / 60), mm = m % 60;
  if (h === 0) return mm + ' min';
  return mm ? h + ' h ' + mm + ' min' : h + ' h';
}
// for the postmark: "6 H 40"
export function fmtPostmark(s) {
  const m = Math.round(s / 60), h = Math.floor(m / 60), mm = m % 60;
  return h === 0 ? mm + ' MIN' : mm ? h + ' H ' + mm : h + ' H';
}
