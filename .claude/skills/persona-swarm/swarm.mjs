#!/usr/bin/env node
// Persona swarm CLI around lib.mjs.
//   swarm.mjs pick <runKey>                       the 5 personas for this run (JSON: id, name, emoji, patience_steps, focus, profile)
//   swarm.mjs report <resultsDir> [--label TEXT]  validate <persona>.json files there, print the markdown friction map,
//                                                 and write <resultsDir>/report.json. Exit 1 if any file is invalid.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickPersonas, validateAgentResult, frictionMap, formatReport } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const loadPanel = (file = join(here, 'personas.yaml')) => JSON.parse(readFileSync(file, 'utf8')).personas;

export function main(argv, { out = (s) => process.stdout.write(`${s}\n`), panel = loadPanel() } = {}) {
  const [cmd, arg] = argv;
  if (cmd === 'pick') {
    out(JSON.stringify(pickPersonas(panel, arg), null, 2));
    return 0;
  }
  if (cmd === 'report' && arg) {
    const labelAt = argv.indexOf('--label');
    const results = readdirSync(arg).filter((f) => f.endsWith('.json') && f !== 'report.json')
      .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(arg, f), 'utf8')) }));
    const bad = results.flatMap(({ file, data }) => validateAgentResult(data).map((p) => `${file}: ${p}`));
    if (bad.length) {
      out(`Invalid agent results:\n${bad.join('\n')}`);
      return 1;
    }
    const data = results.map((r) => r.data);
    writeFileSync(join(arg, 'report.json'), `${JSON.stringify({ results: data, frictionMap: frictionMap(data) }, null, 2)}\n`);
    out(formatReport(data, { label: labelAt >= 0 ? argv[labelAt + 1] : '' }));
    return 0;
  }
  out('usage: swarm.mjs pick <runKey> | report <resultsDir> [--label TEXT]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
