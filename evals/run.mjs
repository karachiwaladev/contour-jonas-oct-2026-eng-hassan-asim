#!/usr/bin/env node
// Runs the evals and writes their results.json files.
//
//   node evals/run.mjs [--project todo] [--base origin/main] [--head HEAD] [--label "Ticket #6"]
//
// unit-tests scores <project>'s unit tests (as of the working tree); merge-risk scores the diff
// base...head; prompt-injection scores the ticket screener on prompt-injection/samples.json.
// Prints one summary line per eval; throws if any results file would be invalid.
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResults, summary, writeResults } from './lib/results.mjs';
import { gatherUnitFacts, unitTestCases } from './unit-tests/eval.mjs';
import { gatherDiffFacts, mergeRiskCases, riskLevel } from './merge-risk/eval.mjs';
import { loadSamples, promptInjectionCases } from './prompt-injection/eval.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const opts = { project: 'todo', base: 'origin/main', head: 'HEAD', label: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in opts) || argv[i + 1] === undefined) throw new Error(`unknown or incomplete option: ${argv[i]}`);
    opts[key] = argv[i + 1];
  }
  return opts;
}

/** Runs the evals against `root` and writes results under `outDir`. Returns the results. */
export function runEvals({ root, outDir = here, project, base, head, label, ranAt }) {
  const sha = (ref) => execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
  const unit = buildResults('unit-tests', { project, label }, unitTestCases(gatherUnitFacts(join(root, project))), ranAt);
  const facts = gatherDiffFacts(root, base, head);
  const riskCases = mergeRiskCases(facts);
  const risk = buildResults('merge-risk', { base: sha(base), head: sha(head), label }, riskCases, ranAt);
  risk.risk = riskLevel(risk.score);
  writeResults(join(outDir, 'unit-tests', 'results.json'), unit);
  const injection = buildResults('prompt-injection', { samples: 'evals/prompt-injection/samples.json', label }, promptInjectionCases(loadSamples()), ranAt);
  writeResults(join(outDir, 'merge-risk', 'results.json'), risk);
  writeResults(join(outDir, 'prompt-injection', 'results.json'), injection);
  return { unit, risk, injection };
}

export function main(argv, root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(), outDir = here) {
  const { unit, risk, injection } = runEvals({ root, outDir, ...parseArgs(argv) });
  console.log(summary(unit));
  console.log(`${summary(risk)} — ${risk.risk} risk`);
  console.log(summary(injection));
  for (const c of [...unit.cases, ...risk.cases, ...injection.cases]) console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}: ${c.detail}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
