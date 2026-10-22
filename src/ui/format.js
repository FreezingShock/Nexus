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

// HUD numbers. Exact with grouping below 10,000 (8,059), then 12.4K, 123K, 3.2M, 1.2B: never more than six characters,
// so the plaques keep their width. Rounds down, so 999,999 reads 999K and never 1000K. The exact value goes on hover.
export function fmtCompact(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (v < 10000) return v.toLocaleString('en-US');
  for (const [div, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (v >= div) {
      const x = v / div;
      return (x < 100 ? (Math.floor(x * 10) / 10).toFixed(1) : String(Math.floor(x))) + unit;
    }
  }
  return String(v);
}
export const fmtExact = (n) => (Number.isFinite(n) ? Math.floor(n) : 0).toLocaleString('en-US');
// Signed per-second rate for the HUD and its cards: +12.4/s, −0.4/s, +1.2K/s. A true minus sign for upkeep.
export function fmtRateCompact(r) {
  const a = Number.isFinite(r) ? Math.abs(r) : 0;
  const body = a < 10000 ? String(Math.round(a * 10) / 10) : fmtCompact(a);
  return (r < 0 ? '−' : '+') + body + '/s';
}
