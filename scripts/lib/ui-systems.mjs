import fs from 'node:fs';
import path from 'node:path';

// The application shell and the shared UI it is built from. Marketing and the
// chat feature carry their own lanes and their own stylesheets.
export const SHELL_ROOTS = [
  'apps/web/app',
  'apps/web/shared',
  'packages/ui/ui/src',
  'packages/ui/design-tokens/src',
];

export const STYLESHEET_ROOTS = ['apps/web', 'packages/ui'];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.cache',
  'dist',
  'build',
  'coverage',
  'e2e',
  '__tests__',
  '__mocks__',
]);

const SOURCE_RE = /\.(tsx?|css)$/;
const EXCLUDED_RE = /\.(test|spec)\.[tj]sx?$|\.d\.ts$/;

export function walkFiles(repoRoot, relDir, predicate, out = []) {
  const abs = path.join(repoRoot, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkFiles(repoRoot, rel, predicate, out);
    } else if (predicate(rel)) {
      out.push(rel);
    }
  }
  return out;
}

export function sourceFiles(repoRoot, roots = SHELL_ROOTS) {
  return roots.flatMap((root) =>
    walkFiles(repoRoot, root, (rel) => SOURCE_RE.test(rel) && !EXCLUDED_RE.test(rel)),
  );
}

export function stylesheets(repoRoot, roots = STYLESHEET_ROOTS) {
  return roots.flatMap((root) => walkFiles(repoRoot, root, (rel) => rel.endsWith('.css')));
}

export function read(repoRoot, rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/** The body of the rule opened at `openIndex` (the index of its `{`). */
export function blockBody(source, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return source.slice(openIndex + 1, i - 1);
}

export function loadBaseline(repoRoot, relPath) {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) return { entries: [], byKey: new Map() };
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const byKey = new Map();
  for (const entry of data.entries) byKey.set(entry.key, entry);
  return { entries: data.entries, byKey };
}

export function writeBaseline(repoRoot, relPath, header, entries) {
  fs.writeFileSync(
    path.join(repoRoot, relPath),
    `${JSON.stringify({ ...header, entries }, null, 2)}\n`,
  );
}

/**
 * A baseline may shrink but never grow, and every entry in it has to say why it
 * is there. An entry with no reason is an open-ended allowlist.
 */
export function compareToBaseline(found, baseline) {
  const unexplained = baseline.entries.filter((entry) => !entry.reason);
  const added = found.filter((item) => !baseline.byKey.has(item.key));
  const foundKeys = new Set(found.map((item) => item.key));
  const removed = baseline.entries.filter((entry) => !foundKeys.has(entry.key));
  return { added, removed, unexplained };
}

export function reportBaseline(name, { added, removed, unexplained }) {
  if (unexplained.length > 0) {
    console.error(`${name}: ${unexplained.length} baseline entries carry no reason`);
    for (const entry of unexplained) console.error(`  ${entry.key}`);
  }
  if (added.length > 0) {
    console.error(`${name}: ${added.length} new violations`);
    for (const item of added) console.error(`  ${item.key}\n    ${item.advice}`);
  }
  if (removed.length > 0) {
    console.error(`${name}: ${removed.length} baseline entries no longer occur, remove them`);
    for (const entry of removed) console.error(`  ${entry.key}`);
  }
  return added.length === 0 && removed.length === 0 && unexplained.length === 0;
}
