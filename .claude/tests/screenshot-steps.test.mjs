// The screenshot script's step wrapping (.claude/skills/factory-loop/screenshot-steps.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asExpression, asStatements, isSyntaxError } from '../skills/factory-loop/screenshot-steps.mjs';

// Evaluate like the page does: an expression string whose promise is awaited.
const evaluate = (code) => (0, eval)(code); // eslint-disable-line no-eval -- test-only, trusted strings

test('an async IIFE step is awaited before the shot', async () => {
  globalThis.done = false;
  const step = '(async () => { await new Promise((r) => setTimeout(r, 30)); globalThis.done = true; })()';
  await evaluate(asExpression(step));
  assert.equal(globalThis.done, true);
});

test('a returned promise is awaited too', async () => {
  globalThis.n = 0;
  await evaluate(asExpression('new Promise((r) => setTimeout(() => { globalThis.n = 2; r(); }, 20))'));
  assert.equal(globalThis.n, 2);
});

test('statements are not a valid expression; the fallback runs them', async () => {
  const stmts = 'const a = 1; globalThis.m = a + 1;';
  assert.throws(() => evaluate(asExpression(stmts)), SyntaxError);
  await evaluate(asStatements(stmts));
  assert.equal(globalThis.m, 2);
});

test('isSyntaxError recognises the CDP exception shape', () => {
  assert.equal(isSyntaxError({ exception: { description: 'SyntaxError: Unexpected token' } }), true);
  assert.equal(isSyntaxError({ exception: { description: 'Error: footer wrong' } }), false);
  assert.equal(isSyntaxError(undefined), false);
});
