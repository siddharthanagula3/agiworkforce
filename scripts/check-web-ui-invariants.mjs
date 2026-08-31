#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WRITE_BASELINE = process.argv.includes('--write-baseline');
const SUMMARY = process.argv.includes('--summary');

const root = process.cwd();
const BASELINE_PATH = 'scripts/.web-ui-invariants-baseline.json';

const SOURCE_ROOTS = [
  'apps/web/app',
  'apps/web/shared',
  'apps/web/features',
  'packages/ui/ui/src',
  'packages/ui/unified-chat/src',
];

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.next',
  '__tests__',
  '__mocks__',
]);

const EXEMPT_PREFIXES = ['packages/ui/design-tokens/'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const PALETTE_FAMILIES = [
  'slate',
  'gray',
  'grey',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
].join('|');

const COLOR_PREFIXES =
  'bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke|accent|caret|placeholder|shadow';

const MIN_FONT_SIZE_PX = 12;

const RULES = [
  {
    id: 'raw-palette',
    regex: new RegExp(`\\b(?:${COLOR_PREFIXES})-(?:${PALETTE_FAMILIES})-(?:\\d{2,3})\\b`, 'g'),
    advice: 'use a semantic token (background/foreground/border/destructive/warning/success/info)',
  },
  {
    id: 'raw-bw',
    regex: new RegExp(`\\b(?:${COLOR_PREFIXES})-(?:white|black)\\b(?!\\/)`, 'g'),
    advice: 'use `background`/`foreground` tokens; light mode is not the only theme',
  },
  {
    id: 'arbitrary-color',
    regex: new RegExp(`\\b(?:${COLOR_PREFIXES})-\\[(?:#|rgb|hsl|oklch|lab)[^\\]]*\\]`, 'g'),
    predicate: (m) => !m[0].includes('var(--'),
    advice: 'move the value into the token layer and reference it',
  },
  {
    id: 'opacity-diluted-text',
    regex: /\btext-[a-z-]*foreground\/\d{1,3}\b|\btext-(?:white|black)\/\d{1,3}\b/g,
    advice:
      'a foreground token is already the de-emphasised value; dropping its opacity drops it under 4.5:1 — change size or weight instead',
  },
  {
    id: 'tiny-type',
    regex: /\btext-\[(\d+(?:\.\d+)?)px\]/g,
    predicate: (m) => Number(m[1]) < MIN_FONT_SIZE_PX,
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor — use the caption or metadata role`,
  },
  {
    id: 'tiny-type-inline',
    regex: /\bfontSize:\s*(\d+(?:\.\d+)?)\b/g,
    predicate: (m) => Number(m[1]) < MIN_FONT_SIZE_PX,
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor — use the caption or metadata role`,
  },
  {
    // The class-based rules above read TSX only, so 32 declarations sat in
    // stylesheets where nothing could see them - eyebrows, badges, docs
    // headings and exit codes down to 9px, on live marketing routes.
    id: 'tiny-type-css',
    // Stylesheets only. The same declaration inside a TSX template literal is
    // usually a sandboxed srcdoc for a decorative thumbnail, and the class and
    // inline rules above already cover real component type.
    extensions: new Set(['.css']),
    regex: /font-size:\s*(\d+(?:\.\d+)?)px/g,
    predicate: (m) => Number(m[1]) < MIN_FONT_SIZE_PX,
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor — raise it or use a role token`,
  },
  {
    id: 'hover-only-affordance',
    regex: /\bopacity-0\b/g,
    predicate: (_m, line) =>
      /(?:group-)?(?:hover|focus|focus-visible|focus-within):opacity-(?:100|\d{2})\b/.test(line) &&
      !/motion-safe|animate|transition-opacity[^"']*data-\[state/.test(line),
    advice:
      'an affordance that only appears on hover is unreachable on touch — keep it present and change its emphasis instead',
  },
];

const INLINE_COMMENT_RE = /^\s*(?:\/\/|\*)/;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

function absolute(rel) {
  return path.join(root, rel);
}

function walk(relDir, files = []) {
  const absDir = absolute(relDir);
  if (!fs.existsSync(absDir)) return files;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(rel, files);
    } else if (
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name)
    ) {
      files.push(rel);
    }
  }
  return files;
}

function isExempt(file) {
  return EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function scanSource(source, file) {
  const withoutBlockComments = source.replace(BLOCK_COMMENT_RE, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  const lines = withoutBlockComments.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    if (INLINE_COMMENT_RE.test(line)) return;
    const code = line.replace(/\/\/.*$/, '');

    for (const rule of RULES) {
      if (rule.extensions && !rule.extensions.has(path.extname(file))) continue;
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(code)) !== null) {
        if (rule.predicate && !rule.predicate(match, code)) continue;
        violations.push({ file, line: index + 1, rule: rule.id, literal: match[0] });
      }
    }
  });

  return violations;
}

function scanFile(file) {
  return scanSource(fs.readFileSync(absolute(file), 'utf8'), file);
}

function baselineKey(v) {
  return `${v.file}:${v.rule}:${v.literal}`;
}

function loadBaseline() {
  const p = absolute(BASELINE_PATH);
  if (!fs.existsSync(p)) return new Map();
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const counts = new Map();
  for (const v of data.violations) {
    const key = baselineKey(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function writeBaseline(violations) {
  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;

  const payload = {
    _description:
      'Grandfathered web UI invariant violations, seeded at the start of the frontend redesign. ' +
      'New violations fail CI. This list only ever shrinks — every redesign phase should reduce ' +
      'it, and the redesign is not finished while it is non-empty. Do not add to it.',
    _counts: byRule,
    violations: violations.map((v) => ({ ...v })),
  };
  fs.writeFileSync(absolute(BASELINE_PATH), JSON.stringify(payload, null, 2) + '\n');
  console.log(`Baseline written: ${BASELINE_PATH} (${violations.length} grandfathered)`);
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${rule}`);
  }
}

const allFiles = SOURCE_ROOTS.flatMap((dir) => walk(dir)).filter((f) => !isExempt(f));
const allViolations = allFiles.flatMap(scanFile);

if (WRITE_BASELINE) {
  writeBaseline(allViolations);
  process.exit(0);
}

const baseline = loadBaseline();
const remaining = new Map(baseline);
const added = [];

for (const violation of allViolations) {
  const key = baselineKey(violation);
  const left = remaining.get(key) || 0;
  if (left > 0) remaining.set(key, left - 1);
  else added.push(violation);
}

if (SUMMARY) {
  const byRule = {};
  for (const v of allViolations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  const baselineTotal = [...baseline.values()].reduce((a, b) => a + b, 0);
  console.log(`web UI invariants — ${allViolations.length} live, ${baselineTotal} baselined`);
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${rule}`);
  }
}

if (added.length === 0) {
  const total = [...baseline.values()].reduce((a, b) => a + b, 0);
  console.log(`check:web-ui-invariants PASS — no new violations (${total} still baselined).`);
  process.exit(0);
}

console.error(`check:web-ui-invariants FAIL — ${added.length} new violation(s).\n`);
const adviceFor = Object.fromEntries(RULES.map((r) => [r.id, r.advice]));
for (const v of added.slice(0, 40)) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.literal}`);
  console.error(`    -> ${adviceFor[v.rule]}`);
}
if (added.length > 40) console.error(`  ... and ${added.length - 40} more`);
console.error('\nFix these rather than baselining them. The baseline only shrinks.\n');
process.exit(1);
