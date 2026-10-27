// Footer under the list: "3 open · 2 done". Hidden when there are no tasks (the empty-state
// message covers that case). aria-live in the markup announces count changes.
/**
 * @param footerEl the <footer> element
 * @param counts   { open, done, total } from countTasks
 */
export function renderTaskFooter(footerEl, { open, done, total }) {
  footerEl.hidden = total === 0;
  footerEl.textContent = total === 0 ? '' : `${open} open · ${done} done`;
}
