// Unit tests for .claude/hooks/guard-bash.sh. Run: node --test '.claude/tests/*.test.mjs'
// The hook reads a PreToolUse JSON payload on stdin; exit 2 means "blocked".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'guard-bash.sh');

// A throwaway repo on a work branch, so branch-dependent rules don't depend on the real checkout.
function repo(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  execSync(`git init -q -b ${branch} && git commit -q --allow-empty -m init`, { cwd: dir });
  return dir;
}
const work = repo('factory/issue-1-x');
const main = repo('main');

function run(command, cwd = work) {
  const r = spawnSync('bash', [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    encoding: 'utf8',
  });
  return r.status;
}
const blocked = (c, cwd) => assert.equal(run(c, cwd), 2, `expected block: ${c}`);
const allowed = (c, cwd) => assert.equal(run(c, cwd), 0, `expected allow: ${c}`);

test('allows ordinary commands', () => {
  allowed('ls -la');
  allowed('git status && git diff');
  allowed('node --test todo/tests/');
});

test('blocks pushing to main in any form', () => {
  blocked('git push origin main');
  blocked('git push -u origin HEAD:main');
  blocked('cd x && git push origin master');
});

test('blocks main pushes written in less common forms', () => {
  blocked('git -C . push origin main');
  blocked('git -C /some/repo push --force');
  blocked('git push origin factory/x:refs/heads/main');
  blocked("bash <<'EOF'\ngit push origin main\nEOF");
  blocked('sh -c "git push --force"');
});

test('blocks pushes hidden behind shell keywords, prefixes or trailing separators', () => {
  blocked('git push origin main;');
  blocked('if true; then git push origin main; fi');
  blocked('(git push origin main)');
  blocked('GIT_TRACE=1 git push --force origin factory/x');
  blocked('env git push origin main');
  blocked('true && { git push origin main; }');
});

test('blocks force-push written as +refspec, combined flags or mirror/all', () => {
  blocked('git push origin +factory/x');
  blocked('git push -uf origin factory/x');
  blocked('git push --force-if-includes origin factory/x');
  blocked('git push --mirror origin');
  blocked('git push --all origin');
});

test('on main, pushing HEAD or switching to main first is blocked', () => {
  blocked('git push -u origin HEAD', main);
  blocked('git switch main && git push');
  blocked('git checkout main; git push origin HEAD');
});

test('blocks recursive rm with split flags, traversal out of tmp; ignores redirects', () => {
  blocked('rm -f -r todo');
  blocked('rm --recursive todo');
  blocked('rm -rf /tmp/../Users/x');
  allowed('rm -rf /tmp/x 2>/dev/null');
});

test('checks heredocs piped into a shell and command substitutions in unquoted heredocs', () => {
  blocked('cat <<EOF | bash\ngit push --force origin main\nEOF');
  blocked('cat <<EOF > f\n$(git reset --hard)\nEOF');
  allowed("cat > notes.md <<'EOF'\nUse bash -c \"git push --force\" never.\nEOF");
});

test('blocks a bare push while on main, allows it on a work branch', () => {
  blocked('git push', main);
  allowed('git push');
  allowed('git push -u origin factory/issue-1-x');
});

test('blocks force-push and remote branch deletion', () => {
  blocked('git push --force origin factory/issue-1-x');
  blocked('git push -f');
  blocked('git push --force-with-lease origin factory/x');
  blocked('git push origin --delete factory/x');
  blocked('git push origin :factory/x');
});

test('blocks merging and auto-merge', () => {
  blocked('gh pr merge 8 --squash');
  blocked('gh pr create --auto --title x');
});

test('blocks history and file destruction', () => {
  blocked('git reset --hard HEAD~1');
  blocked('git clean -fd');
  blocked('git branch -D old');
  blocked('git commit --amend -m x');
  blocked('git rebase -i HEAD~3');
  blocked('rm -rf todo');
  blocked('rm -r ./src');
});

test('allows recursive rm only inside tmp or the scratchpad', () => {
  allowed('rm -rf /private/tmp/claude-501/x/scratchpad/shots');
  allowed('rm -rf /tmp/hooktest');
});

test('blocks paid deepsec stages, allows the free ones', () => {
  blocked('cd .deepsec && npx deepsec process');
  blocked('pnpm deepsec revalidate');
  blocked('npx deepsec triage');
  blocked('npx -y deepsec@2.3.10 init');
  allowed('npx -y deepsec@2.3.10 init --scaffold-only');
  allowed('cd .deepsec && npx deepsec scan');
});

test('does not block commands that only mention a dangerous command', () => {
  allowed('grep -n "git push --force" README.md');
  allowed('git commit -m "docs: never run gh pr merge"');
  allowed('echo "rm -rf is blocked"');
  allowed("echo 'never run a full `deepsec init`, only scan'");
});

test('backticks inside double quotes are executed, so they are checked', () => {
  blocked('echo "never run a full `deepsec init`, only scan"');
  blocked('echo "$(gh pr merge 8)"');
});

test('ignores heredoc bodies (file content being written)', () => {
  allowed("cat > notes.md <<'EOF'\ngit push --force origin main\n`deepsec init`\nrm -rf /\nEOF");
  allowed('python3 - <<EOF\ns = "gh pr merge 8"\nEOF\necho done');
  blocked("cat > x <<'EOF'\nhello\nEOF\ngit push origin main");
});
