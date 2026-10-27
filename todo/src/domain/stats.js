// Task counts for the footer. Pure; counts every task given (the caller passes all tasks, not
// the filtered view, so the totals don't change when a filter is applied).
export function countTasks(tasks) {
  const done = tasks.filter((t) => t.done === true).length;
  return { open: tasks.length - done, done, total: tasks.length };
}
