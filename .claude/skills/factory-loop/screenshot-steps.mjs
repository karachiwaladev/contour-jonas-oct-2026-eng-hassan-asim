// How a steps.json "js" string is run in the page. A step may be an expression (often an async
// IIFE, `(async () => { … })()`) or plain statements. The expression form *returns* the value, so a
// returned promise is awaited before the screenshot; statements that aren't a valid expression fall
// back to a statement body. (Before this, an async IIFE step wasn't awaited and shots came early.)
export const asExpression = (js) => `(async () => { return (${js}\n); })()`;
export const asStatements = (js) => `(async () => { ${js}\n })()`;

/** True when the page rejected the expression form only because the step is statements. */
export const isSyntaxError = (details) => /SyntaxError/.test(details?.exception?.description ?? details?.text ?? '');
