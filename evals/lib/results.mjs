// Shared shape of an eval run: cases → score → results.json.
//   { eval, score, target, ranAt, cases: [{ id, pass, detail }] }
// score = percentage of passing cases, rounded to a whole number.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const score = (cases) => (cases.length ? Math.round((100 * cases.filter((c) => c.pass).length) / cases.length) : 0);

export function buildResults(name, target, cases, ranAt = new Date().toISOString()) {
  return { eval: name, score: score(cases), target, ranAt, cases };
}

/** Problems that make a results object invalid (empty list = valid). */
export function validate(results) {
  const problems = [];
  if (!results || typeof results !== 'object') return ['results must be an object'];
  if (!Number.isFinite(results.score) || results.score < 0 || results.score > 100) problems.push('score must be a number 0–100');
  if (!Array.isArray(results.cases) || results.cases.length === 0) return [...problems, 'cases must be a non-empty array'];
  const ids = new Set();
  for (const c of results.cases) {
    if (typeof c?.id !== 'string' || !c.id) problems.push('every case needs a string id');
    else if (ids.has(c.id)) problems.push(`duplicate case id ${c.id}`);
    else ids.add(c.id);
    if (typeof c?.pass !== 'boolean') problems.push(`case ${c?.id}: pass must be true or false`);
  }
  if (Number.isFinite(results.score) && results.score !== score(results.cases)) problems.push('score does not match the cases');
  return problems;
}

export function writeResults(path, results) {
  const problems = validate(results);
  if (problems.length) throw new Error(`invalid results for ${path}: ${problems.join('; ')}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
}

/** One line per eval for the terminal, PR bodies and ticket replies. */
export const summary = (r) =>
  `${r.eval}: ${r.score}/100 (${r.cases.filter((c) => c.pass).length}/${r.cases.length} cases pass)`;
