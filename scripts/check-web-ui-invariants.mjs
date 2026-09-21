#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WRITE_BASELINE = process.argv.includes('--write-baseline');
const SUMMARY = process.argv.includes('--summary');
const JSON_OUT = process.argv.includes('--json');

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

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const STYLESHEET_EXTENSION = '.css';

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
      'a foreground token is already the de-emphasised value; dropping its opacity drops it under 4.5:1, change size or weight instead',
  },
  {
    id: 'tiny-type',
    regex: /\btext-\[(\d+(?:\.\d+)?)px\]/g,
    predicate: (m) => Number(m[1]) < MIN_FONT_SIZE_PX,
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor, use the caption or metadata role`,
  },
  {
    id: 'tiny-type-inline',
    regex: /\bfontSize:\s*(\d+(?:\.\d+)?)\b/g,
    predicate: (m) => Number(m[1]) < MIN_FONT_SIZE_PX,
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor, use the caption or metadata role`,
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
    advice: `below the ${MIN_FONT_SIZE_PX}px legibility floor, raise it or use a role token`,
  },
  {
    id: 'arbitrary-z-index',
    regex: /\bz-\[([^\]]+)\]/g,
    predicate: (m) => !m[1].includes('var(--'),
    advice:
      'stacking is a shared ladder; use z-[var(--z-overlay)], z-[var(--z-modal)] or z-[var(--z-popover)] so one rung cannot outrank another by accident',
  },
  {
    id: 'arbitrary-z-index-css',
    extensions: new Set(['.css']),
    regex: /z-index:\s*(-?\d+)/g,
    advice:
      'stacking is a shared ladder; reference the overlay, modal or popover token instead of a bare rung',
  },
  {
    id: 'hover-only-affordance',
    regex: /\bopacity-0\b/g,
    predicate: (_m, line) =>
      /(?:group-)?(?:hover|focus|focus-visible|focus-within):opacity-(?:100|\d{2})\b/.test(line) &&
      !/motion-safe|animate|transition-opacity[^"']*data-\[state/.test(line),
    advice:
      'an affordance that only appears on hover is unreachable on touch, keep it present and change its emphasis instead',
  },
];

const INLINE_COMMENT_RE = /^\s*(?:\/\/|\*)/;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

// A JSX attribute is regularly written five lines away from its element, so
// these three read the whole opening tag rather than one line.
function openingTag(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '<' && index > start) return null;
    else if (character === '>' && depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function tagRule(elements, id, advice, offends) {
  const opener = new RegExp(`<(?:${elements.join('|')})\\b`, 'g');
  return {
    id,
    advice,
    scan(source, file) {
      if (path.extname(file) !== '.tsx') return [];
      const found = [];
      for (const match of source.matchAll(opener)) {
        const tag = openingTag(source, match.index);
        if (tag === null || !offends(tag)) continue;
        found.push({ line: lineOf(source, match.index), literal: match[0] });
      }
      return found;
    },
  };
}

const SOURCE_RULES = [
  tagRule(
    ['div', 'span', 'li', 'td'],
    'clickable-div-without-semantics',
    'a click handler on a non-interactive element is invisible to the keyboard and to assistive technology; use a button, or give the element a role and a key handler',
    (tag) => /\bonClick=/.test(tag) && !/\brole=/.test(tag) && !/\btabIndex=/.test(tag),
  ),
  tagRule(
    ['a', 'Link'],
    'unsafe-blank-target',
    'a new tab opened without rel="noopener noreferrer" hands the opener window to the destination',
    (tag) => /target=["'{]?_blank/.test(tag) && !/noopener/.test(tag),
  ),
  {
    id: 'outline-none-without-focus-ring',
    advice:
      'removing the focus outline without drawing a replacement leaves keyboard users with no idea where they are; pair it with focus-visible:ring or focus-visible:outline',
    scan(source, file) {
      if (path.extname(file) === '.css') return [];
      const lines = source.split('\n');
      const found = [];
      lines.forEach((line, index) => {
        if (!/\boutline-none\b/.test(line)) return;
        const window = lines.slice(Math.max(0, index - 4), index + 5).join(' ');
        if (/focus(?:-visible)?:(?:ring|outline|shadow|border)/.test(window)) return;
        found.push({ line: index + 1, literal: 'outline-none' });
      });
      return found;
    },
  },
];

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
      const extension = path.extname(file);
      if (rule.extensions ? !rule.extensions.has(extension) : extension === STYLESHEET_EXTENSION) {
        continue;
      }
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
  const source = fs.readFileSync(absolute(file), 'utf8');
  const violations = scanSource(source, file);
  for (const rule of SOURCE_RULES) {
    for (const hit of rule.scan(source, file)) {
      violations.push({ file, line: hit.line, rule: rule.id, literal: hit.literal });
    }
  }
  return violations;
}

function baselineKey(v) {
  return `${v.file}:${v.rule}:${v.literal}`;
}

function loadBaseline() {
  const p = absolute(BASELINE_PATH);
  if (!fs.existsSync(p)) return { counts: new Map(), unreasoned: [] };
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const counts = new Map();
  const rules = new Set();
  for (const v of data.violations) {
    const key = baselineKey(v);
    counts.set(key, (counts.get(key) || 0) + 1);
    rules.add(v.rule);
  }
  const reasons = data._reasons ?? {};
  const unreasoned = [...rules].filter((rule) => (reasons[rule] ?? '').trim().length < 60).sort();
  return { counts, unreasoned };
}

function writeBaseline(violations) {
  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;

  const p = absolute(BASELINE_PATH);
  const previous = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};

  const payload = {
    _description:
      'Grandfathered web UI invariant violations, seeded at the start of the frontend redesign. ' +
      'New violations fail CI. This list only ever shrinks, every redesign phase should reduce ' +
      'it, and the redesign is not finished while it is non-empty. Do not add to it.',
    _reasons: previous._reasons ?? {},
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

if (JSON_OUT) {
  console.log(JSON.stringify(allViolations));
  process.exit(0);
}

if (WRITE_BASELINE) {
  writeBaseline(allViolations);
  process.exit(0);
}

const { counts: baseline, unreasoned } = loadBaseline();
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
  console.log(`web UI invariants, ${allViolations.length} live, ${baselineTotal} baselined`);
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${rule}`);
  }
}

if (unreasoned.length > 0) {
  console.error(
    `check:web-ui-invariants FAIL, ${unreasoned.length} baselined rule(s) carry no reason:\n`,
  );
  for (const rule of unreasoned) {
    console.error(`  ${rule}  -> add "_reasons.${rule}" saying why it is owed, not just allowed`);
  }
  process.exit(1);
}

if (added.length === 0) {
  const total = [...baseline.values()].reduce((a, b) => a + b, 0);
  console.log(`check:web-ui-invariants PASS, no new violations (${total} still baselined).`);
  process.exit(0);
}

console.error(`check:web-ui-invariants FAIL, ${added.length} new violation(s).\n`);
const adviceFor = Object.fromEntries([...RULES, ...SOURCE_RULES].map((r) => [r.id, r.advice]));
for (const v of added.slice(0, 40)) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.literal}`);
  console.error(`    -> ${adviceFor[v.rule]}`);
}
if (added.length > 40) console.error(`  ... and ${added.length - 40} more`);
console.error('\nFix these rather than baselining them. The baseline only shrinks.\n');
process.exit(1);
