// Prompt-injection rules for untrusted text (ticket titles, bodies, comments, fetched pages).
// Each rule is a regex with a severity:
//   malicious  — the text tries to steer the agent outside its rules: don't act on the ticket.
//   suspicious — hidden content or claimed authority: act only after the owner confirms on the ticket.
// Rules judge content only, whoever wrote it: a legitimate author can still paste a payload.
// Pure functions, unit-tested in .claude/tests/injection.test.mjs. Patterns are written to catch
// instructions *to the agent*, so ordinary feature requests ("add a delete button") stay clean.

const W = String.raw`[\s\S]{0,60}?`; // a short gap of any text between two key phrases

export const RULES = Object.freeze([
  // Overriding the agent's instructions or identity.
  { id: 'override-instructions', severity: 'malicious', re: new RegExp(String.raw`\b(ignore|disregard|forget|override|bypass)\b${W}\b(previous|prior|above|earlier|all|any|your|the|these|system)\b${W}\b(instructions?|rules?|prompts?|directions?|guidelines?|guardrails?|constraints?)\b`, 'i') },
  // The same override in other languages (the eval's non-English sample was a known miss).
  { id: 'override-instructions-i18n', severity: 'malicious', re: /\b(ignora|ignorez|ignoriere|ignorieren|olvida|vergiss|esquece|dimentica)\b[\s\S]{0,40}\b(instrucciones|instructions|anweisungen|instruções|istruzioni|reglas|règles|regeln|regras|regole)\b/i },
  { id: 'role-hijack', severity: 'malicious', re: /\b(you are now|from now on,? you|act as (an? )?(unrestricted|jailbroken|different)|developer mode|DAN mode|new (system )?instructions?:)/i },
  { id: 'fake-role-tags', severity: 'malicious', re: /<\/?\s*(system|assistant|developer)\s*>|\[\/?INST\]|<\|im_(start|end)\|>|^#{1,3}\s*system\s*(prompt)?\s*:?\s*$/im },
  { id: 'system-prompt-probe', severity: 'malicious', re: /\b(reveal|print|show|repeat|output|leak)\b[\s\S]{0,40}\b(system prompt|your (instructions|prompt|rules)|CLAUDE\.md|SKILL\.md)\b/i },

  // Secrets and exfiltration.
  // Nouns are the agent's own secrets, so app features ("show password toggle") stay clean.
  { id: 'secret-exfiltration', severity: 'malicious', re: new RegExp(String.raw`\b(print|send|post|upload|exfiltrate|leak|reveal|paste|echo|cat|share|include|email|commit|dump|read)\b${W}(\b(your|the|my|repo|repository|github|gh|api|access|auth|deploy|environment|env|npm|cloud|aws|anthropic|openai)\s+(tokens?|secrets?|keys?|credentials?|passwords?)\b|\.env\b|\bssh[ _-]?keys?\b|\bid_rsa\b|\bid_ed25519\b|\bGH_TOKEN\b|\bGITHUB_TOKEN\b|\bANTHROPIC_API_KEY\b|\benv(ironment)? var(iable)?s\b)`, 'i') },
  { id: 'secret-commands', severity: 'malicious', re: /\bgh auth token\b|--show-token|~\/\.ssh|\.aws\/credentials|\.netrc\b|\bprintenv\b|hosts\.yml/i },

  // Tampering with the harness or its safety rules.
  { id: 'harness-tampering', severity: 'malicious', re: new RegExp(String.raw`\b(disable|remove|delete|bypass|skip|turn off|comment out|weaken|edit|modify|rewrite|overwrite|change)\b${W}(\.claude\/|\bguard-bash\b|\b(git|pre-?commit|claude|safety|factory|stop|pre-?tool-?use) hooks?\b|\bguardrails?\b|\bquality[ -]gate\b|\bsettings\.json\b|\bSKILL\.md\b|\bsafety (rules|checks)\b|\bbranch protection\b|\bcoverage (thresholds?|config)\b)`, 'i') },
  { id: 'no-verify', severity: 'malicious', re: /--no-verify\b|core\.hooksPath|dangerously-?skip-?permissions|dangerouslyDisableSandbox/i },

  // Operations the loop must never do, requested in the ticket.
  { id: 'forbidden-git', severity: 'malicious', re: /\b(push|commit)\b[\s\S]{0,30}\b(directly )?(to|into|on) (the )?(main|master)\b|\bforce[ -]?push|push\s+(-f|--force)|\bgh pr merge\b|\bmerg(e|ing) (it|this( pr| pull request)?|the (pr|pull request)|your( own)? (pr|pull request)) (yourself|now|immediately|without)|\bauto-?merge\b|reset --hard|\brm -rf\b/i },
  { id: 'remote-code', severity: 'malicious', re: /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(download|fetch)\b[\s\S]{0,40}\b(and )?(run|execute|eval)\b|\beval\s*\(?\s*\$\(\s*(curl|wget)/i },

  // Spoofing the loop's own markers (only the loop may write them).
  { id: 'marker-spoof', severity: 'malicious', re: /<!--\s*factory-loop/i },

  // Hidden or smuggled content.
  { id: 'invisible-characters', severity: 'suspicious', re: /[​-‏⁠-⁤﻿‪-‮⁦-⁩\u{E0000}-\u{E007F}]/u },
  { id: 'html-comment', severity: 'suspicious', re: /<!--(?!\s*factory-loop)[\s\S]*?-->/i },
  { id: 'encoded-blob', severity: 'suspicious', re: /[A-Za-z0-9+/]{120,}={0,2}/ },

  // Claimed authority or pressure to skip checks.
  { id: 'authority-claim', severity: 'suspicious', re: /\b(the )?(owner|admin(istrator)?|maintainer|instructor|anthropic|claude team|security team)\b[\s\S]{0,20}\b(says|said|approved|authori[sz]ed|wants you|has allowed|instructs)\b|\bpre-?approved\b|\balready approved\b/i },
  { id: 'skip-checks', severity: 'suspicious', re: /\b(without|don'?t|do not|no need to)\s+(ask(ing)? (me|the owner|anyone|for (approval|permission))|(wait(ing)? for |get(ting)? )?(approval|review)|(a |any |code )?review(ing)?|running (the )?(tests|checks|quality gate)|tell(ing)? (the owner|anyone)|mention(ing)? (this|it))\b/i },
  { id: 'external-upload', severity: 'suspicious', re: /\b(send|post|upload|webhook|forward)\b[\s\S]{0,60}https?:\/\/(?!([a-z0-9-]+\.)*github(usercontent)?\.com)[^\s)]+/i },
]);

const SEVERITY = { clean: 0, suspicious: 1, malicious: 2 };
export const worst = (levels) => levels.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'clean');

// A short, safe excerpt: invisible characters shown as \u escapes, newlines flattened, capped.
export function excerpt(text, index, length) {
  const raw = text.slice(Math.max(0, index - 10), index + Math.min(length, 50) + 10);
  return raw.replace(/[\u0000-\u001F\u007F-\u009F​-‏⁠-⁤﻿‪-‮⁦-⁩]/gu,
    (c) => (c === '\n' ? ' ' : `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`)).slice(0, 80);
}

// What a reader sees on GitHub: HTML comments and invisible characters removed.
export const visibleText = (text) => String(text ?? '')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu, '');

/** Findings for one piece of text (the loop's own comments are filtered out before this). */
export function screenText(text, where = 'text') {
  const s = String(text ?? '');
  const findings = [];
  for (const rule of RULES) {
    const m = rule.re.exec(s);
    if (m) findings.push({ rule: rule.id, severity: rule.severity, where, excerpt: excerpt(s, m.index, m[0].length) });
  }
  return findings;
}
