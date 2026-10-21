export const $ = (id) => document.getElementById(id);
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
export const fmtRate = (r) => '+' + (Math.round(r * 10) / 10) + '/s';
// "just now", "12 min ago", "3 h ago", then a short date. For saves and backups.
export function fmtAgo(t, now = Date.now()) {
  if (!Number.isFinite(t)) return 'a while ago';
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 36 ? h + ' h ago' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

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
