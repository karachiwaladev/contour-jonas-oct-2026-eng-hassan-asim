// Calendar dates as 'YYYY-MM-DD' strings. Arithmetic runs in UTC on plain dates, so local time
// zones and DST can never shift a due date by a day.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');
export const formatIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Today (or any Date) as a local calendar date. */
export const isoDate = (date) => formatIso(date.getFullYear(), date.getMonth() + 1, date.getDate());

/** [year, month (1-12), day] of a valid ISO date string. */
export const parseIso = (s) => s.split('-').map(Number);

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isValidIsoDate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function addDays(s, n) {
  const [y, m, d] = parseIso(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return formatIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
