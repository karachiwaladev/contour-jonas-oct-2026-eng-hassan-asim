// Date logic for recurring tasks. Dates are 'YYYY-MM-DD' strings handled as plain calendar
// dates (no Date/time-zone arithmetic), so a due date never drifts by a day.
const Recur = (() => {
  const LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

  const parse = (s) => s.split('-').map(Number);
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  function addDays(s, n) {
    const [y, m, d] = parse(s);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  // Next month, keeping the anchor day where the month allows (Jan 31 -> Feb 28 -> Mar 31).
  function addMonth(s, anchorDay) {
    const [y, m] = parse(s);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return fmt(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
  }

  function step(s, repeat, anchorDay) {
    if (repeat === 'daily') return addDays(s, 1);
    if (repeat === 'weekly') return addDays(s, 7);
    return addMonth(s, anchorDay);
  }

  // Next due date after `due` (or after `today` when there is none), moved forward until it is
  // today or later so a late task doesn't spawn a backlog of overdue copies.
  function next(due, repeat, anchorDay, today) {
    let d = step(due || today, repeat, anchorDay);
    while (d < today) d = step(d, repeat, anchorDay);
    return d;
  }

  const dayOf = (s) => parse(s)[2];

  return { LABELS, next, dayOf };
})();
