#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WRITE_BASELINE = process.argv.includes('--write-baseline');

const root = process.cwd();
const MOBILE_ROOT = 'apps/mobile';
const BASELINE_PATH = 'apps/mobile/scripts/.no-hex-baseline.json';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.expo',
  'ios',
  'android',
  '__tests__',
]);

const EXEMPT_PREFIXES = [
  'apps/mobile/__tests__/',
  'apps/mobile/scripts/screenshots/',
  'apps/mobile/src/ui/theme/tokens.ts',
  'packages/ui/design-tokens/',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const COLOR_PATTERNS = [
  { rule: 'hex', regex: /#[0-9a-fA-F]{3,8}\b/g },
  { rule: 'rgba', regex: /rgba?\s*\(/g },
  { rule: 'hsla', regex: /hsla?\s*\(/g },
  {
    rule: 'named-color',
    regex:
      /(?:color|backgroundColor|borderColor|tintColor|shadowColor|placeholderTextColor)\s*[:=]\s*['"](?:red|green|blue|white|black|yellow|orange|purple|pink|cyan|magenta|gray|grey|lime|navy|olive|silver|aqua|fuchsia|maroon|teal|transparent)['"](?!\w)/gi,
  },
];

const INLINE_COMMENT_RE = /^\s*\/\//;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

function isInterpolatedFunctionalColor(codeOnly, matchIndex) {
  const close = codeOnly.indexOf(')', matchIndex);
  const call = close === -1 ? codeOnly.slice(matchIndex) : codeOnly.slice(matchIndex, close + 1);
  return call.includes('${');
}

function absolute(rel) {
  return path.join(root, rel);
}

function walk(relDir, files = []) {
  const absDir = absolute(relDir);
  if (!fs.existsSync(absDir)) return files;

  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      walk(rel, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(rel);
    }
  }
  return files;
}

function isExempt(relPath) {
  return EXEMPT_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function stripBlockComments(source) {
  return source.replace(BLOCK_COMMENT_RE, (m) => ' '.repeat(m.length));
}

function scanFile(relPath) {
  const source = fs.readFileSync(absolute(relPath), 'utf8');
  const stripped = stripBlockComments(source);
  const lines = stripped.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (INLINE_COMMENT_RE.test(line)) continue;

    const codeOnly = line.replace(/\/\/.*$/, '');

    for (const { rule, regex } of COLOR_PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(codeOnly)) !== null) {
        if (rule === 'named-color' && /<Badge\b/.test(codeOnly)) {
          continue;
        }
        if (
          (rule === 'rgba' || rule === 'hsla') &&
          isInterpolatedFunctionalColor(codeOnly, m.index)
        ) {
          continue;
        }
        hits.push({
          file: relPath,
          line: i + 1,
          literal: m[0].trim(),
          rule,
        });
      }
    }
  }

  return hits;
}

function loadBaseline() {
  const p = absolute(BASELINE_PATH);
  if (!fs.existsSync(p)) return new Set();
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const counts = new Map();
  for (const v of data.violations) {
    const key = baselineKey(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function baselineKey(v) {
  return `${v.file}:${v.rule}:${v.literal}`;
}

const SCRIM_LINE_RE = /rgba\s*\(\s*0\s*,\s*0\s*,\s*0\s*,/;

function isScrimShaped(v) {
  if (v.rule !== 'rgba') return false;
  try {
    const lines = fs.readFileSync(absolute(v.file), 'utf8').split('\n');
    const lineText = lines[v.line - 1] || '';
    return SCRIM_LINE_RE.test(lineText);
  } catch {
    return false;
  }
}

function writeBaseline(violations) {
  const dir = path.dirname(absolute(BASELINE_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const annotated = violations.map((v) => {
    const entry = { ...v };
    if (isScrimShaped(v)) {
      entry._note = 'scrim-shaped, convert to colors.scrim or similar token in follow-up';
    }
    return entry;
  });

  const payload = {
    _description:
      'Grandfathered hardcoded color literals as of AP-02 Stage 3 baseline seed (2026-05-23). ' +
      'New violations will fail CI. Reduce this list incrementally; do not add to it. ' +
      'Scrim-shaped rgba(0,0,0,...) entries should be migrated to useThemeColors().scrim.',
    violations: annotated,
  };

  fs.writeFileSync(absolute(BASELINE_PATH), JSON.stringify(payload, null, 2) + '\n');
  console.log(`Baseline written: ${BASELINE_PATH} (${violations.length} grandfathered violations)`);
}

const files = walk(MOBILE_ROOT).filter((f) => !isExempt(f));
const allViolations = files.flatMap(scanFile);

if (WRITE_BASELINE) {
  writeBaseline(allViolations);
  process.exit(0);
}

const baseline = loadBaseline();
const remainingBaseline = new Map(baseline);
const newViolations = [];

for (const violation of allViolations) {
  const key = baselineKey(violation);
  const remaining = remainingBaseline.get(key) || 0;
  if (remaining > 0) {
    remainingBaseline.set(key, remaining - 1);
  } else {
    newViolations.push(violation);
  }
}

if (newViolations.length === 0) {
  console.log('check:no-hex-mobile PASS, no new hardcoded color literals.');
  process.exit(0);
}

console.error(
  `check:no-hex-mobile FAIL, ${newViolations.length} new hardcoded color literal(s) found.\n`,
);
for (const v of newViolations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.literal}`);
  console.error(`    -> use \`useThemeColors().<tokenName>\` instead`);
}
console.error('\nTo add intentional new literals to the baseline, run:');
console.error('  node scripts/check-no-hex-colors-mobile.mjs --write-baseline');
console.error('But prefer fixing them instead.\n');
process.exit(1);
