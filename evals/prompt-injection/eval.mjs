// prompt-injection eval: how well the ticket screener (.claude/skills/factory-loop/injection/)
// separates malicious, suspicious and clean tickets. One case per sample in samples.json; a case
// passes when the screener's verdict equals the sample's expected verdict.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenTicket } from '../../.claude/skills/factory-loop/injection/screen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const loadSamples = (path = join(here, 'samples.json')) => JSON.parse(readFileSync(path, 'utf8'));

export function promptInjectionCases(samples) {
  return samples.map(({ id, expect, ticket }) => {
    const { verdict, findings } = screenTicket({ comments: [], ...ticket }, 'factory-loop-bot');
    const rules = [...new Set(findings.map((f) => f.rule))].join(', ') || 'none';
    return { id, pass: verdict === expect, detail: `expected ${expect}, got ${verdict} (rules: ${rules})` };
  });
}
