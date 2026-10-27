// Persona swarm: pure rules (persona pick, target guard, findings → friction map). No I/O, so
// every rule is unit-tested in .claude/tests/persona-swarm.test.mjs. Formats follow shoal
// (github.com/Raynan00/shoal): personas.yaml uses its persona schema, findings its report_finding
// shape, and the report is its friction map — distinct issues ranked by how many agents hit them.

export const SWARM_SIZE = 5;
export const ALWAYS = 'hacker-hana'; // the security persona runs every time
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/**
 * 5 of the persona panel for a run: the always-on persona plus 4 others, rotating which one sits
 * out by `runKey` (the issue number), so every persona runs at least every other build.
 */
export function pickPersonas(personas, runKey) {
  const always = personas.find((p) => p.id === ALWAYS);
  const rest = personas.filter((p) => p.id !== ALWAYS);
  if (!always || rest.length < SWARM_SIZE - 1) throw new Error('persona panel needs the hacker and at least 4 others');
  const out = Math.abs(Number(runKey) || 0) % rest.length;
  const others = rest.filter((_, i) => i !== out).slice(0, SWARM_SIZE - 1);
  return [always, ...others];
}

/** Agents only ever drive local dev servers, never a real site. */
export function isLocalUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Problems with one agent's findings file (empty list = valid). */
export function validateAgentResult(r) {
  const problems = [];
  if (!r || typeof r !== 'object') return ['result must be an object'];
  if (typeof r.persona !== 'string' || !r.persona) problems.push('persona id missing');
  if (!['completed', 'gave_up', 'blocked'].includes(r.outcome)) problems.push('outcome must be completed | gave_up | blocked');
  if (!Array.isArray(r.findings)) return [...problems, 'findings must be an array'];
  r.findings.forEach((f, i) => {
    if (typeof f?.title !== 'string' || !f.title.trim()) problems.push(`finding ${i}: title missing`);
    if (!SEVERITIES.includes(f?.severity)) problems.push(`finding ${i}: severity must be ${SEVERITIES.join('|')}`);
  });
  return problems;
}

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'and', 'or', 'of', 'to', 'in', 'on', 'it', 'when', 'with', 'no', 'not', 'be', 'can']);
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);
const similarity = (a, b) => {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / Math.max(1, Math.min(a.size, b.size));
};

/**
 * Friction map: findings from all agents clustered by title similarity (word overlap ≥ 0.6),
 * ranked by how many distinct personas hit the issue, then by worst severity.
 */
export function frictionMap(results) {
  const clusters = [];
  for (const r of results) {
    for (const f of r.findings) {
      const w = words(f.title);
      let c = clusters.find((k) => similarity(k.words, w) >= 0.6);
      if (!c) clusters.push((c = { title: f.title.trim(), words: w, personas: new Set(), severity: 'low', items: [] }));
      c.personas.add(r.persona);
      if (SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(c.severity)) c.severity = f.severity;
      c.items.push({ persona: r.persona, ...f });
    }
  }
  return clusters
    .map(({ words: _w, personas, ...c }) => ({ ...c, hits: personas.size, personas: [...personas] }))
    .sort((a, b) => b.hits - a.hits || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

/** Markdown report for the PR body: outcomes per persona, then the ranked friction map. */
export function formatReport(results, { label = '' } = {}) {
  const map = frictionMap(results);
  const out = [`## Persona swarm${label ? ` · ${label}` : ''}`, '',
    '| Persona | Outcome | Steps | Findings |', '|---|---|---|---|',
    ...results.map((r) => `| ${r.persona} | ${r.outcome} | ${r.steps ?? '—'} | ${r.findings.length} |`), ''];
  if (!map.length) return [...out, 'No findings: every persona got through without filing an issue.'].join('\n');
  out.push('**Friction map** (distinct issues, ranked by how many personas hit them):', '');
  map.forEach((c, i) => {
    out.push(`${i + 1}. **${clip(c.title, 100)}**: ${c.hits}/${results.length} personas · ${c.severity} · ${c.personas.join(', ')}`);
    for (const it of c.items.slice(0, 2)) out.push(`   - ${it.persona}: ${clip(it.detail, 160)}`);
  });
  return out.join('\n');
}
