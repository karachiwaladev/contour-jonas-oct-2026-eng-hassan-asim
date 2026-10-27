// Free-text search over a task's title and tags. Pure: the UI passes the box's text through
// parseQuery once per keystroke, and matchesSearch runs per task.

/** Search terms from the box: trimmed, lower-cased, split on spaces, a leading # dropped. */
export function parseQuery(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^#+/, ''))
    .filter(Boolean);
}

/** True when every term appears (as a substring) in the title or in one of the tags. */
export function matchesSearch(task, terms) {
  const title = task.title.toLowerCase();
  return terms.every((term) => title.includes(term) || task.tags.some((tag) => tag.includes(term)));
}
