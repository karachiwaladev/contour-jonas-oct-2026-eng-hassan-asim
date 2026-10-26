// Prints deepsec scan candidates for the changed files (CHANGED: newline-separated repo paths) that
// still exist under ROOT, from the workspace in DS. Exits non-zero with a message if the results can't be read, so the gate
// reports "unreadable" instead of a false "no candidates".
const fs = require('fs');
const path = require('path');

const want = new Set((process.env.CHANGED || '').split('\n').filter(Boolean));
const dataDir = path.join(process.env.DS, 'data');
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

try {
  const projects = fs.readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  if (!projects.length) throw new Error(`no project in ${dataDir}`);
  const filesDir = path.join(dataDir, projects[0].name, 'files');
  if (!fs.existsSync(filesDir)) process.exit(0); // scan ran and recorded no candidate files
  for (const f of walk(filesDir)) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!want.has(r.filePath) || !fs.existsSync(path.join(process.env.ROOT || '.', r.filePath))) continue;
    for (const c of r.candidates || []) {
      console.log(`${r.filePath}:${(c.lineNumbers || []).join(',')} ${c.vulnSlug} (${c.matchedPattern})`);
    }
  }
} catch (e) {
  console.error(e.message);
  process.exit(3);
}
