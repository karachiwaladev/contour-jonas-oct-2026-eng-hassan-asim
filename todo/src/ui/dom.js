// Tiny element builder. Text always goes through textContent and attributes through
// setAttribute, so stored task data can never be interpreted as HTML.
export function el(tag, { className, text, attrs = {}, on = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
  node.append(...children.filter(Boolean));
  return node;
}

/**
 * Replaces a container's children; if focus was on a child with data-key, focuses the new child
 * with the same key, so re-rendering doesn't throw keyboard users back to the top of the page.
 */
export function replaceKeepingFocus(container, children) {
  const key = container.contains(document.activeElement) ? document.activeElement.dataset.key : undefined;
  container.replaceChildren(...children);
  if (key !== undefined) children.find((c) => c.dataset.key === key)?.focus();
}

/** A toggle-style chip button (aria-pressed reflects the selection). */
export const chip = (label, pressed, onClick, attrs = {}) =>
  el('button', { text: label, attrs: { type: 'button', 'aria-pressed': String(pressed), ...attrs }, on: { click: onClick } });
