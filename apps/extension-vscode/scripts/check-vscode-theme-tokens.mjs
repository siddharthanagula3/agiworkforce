#!/usr/bin/env node
// AP-02 gate: VS Code webviews must use var(--vscode-*) theme tokens,
// not hardcoded color literals.
//
// Usage:
//   node scripts/check-vscode-theme-tokens.mjs              # gate run (exit 1 on new violations)
//   node scripts/check-vscode-theme-tokens.mjs --update-baseline  # regenerate .no-hex-baseline.json
//
// Exemptions (by design):
//   - apps/extension-vscode/src/__tests__/**  and  src/test/**  (test fixtures)
//   - *DecorationProvider*.ts  (editor decoration API accepts literal colors directly)
//   - apps/extension-vscode/out/**  (compiled output)
//   - Codicon icon-name strings: $(lightbulb) style patterns — not colors
//   - Color literals inside  var(--token, #fallback)  — VS Code-endorsed pattern

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const EXT_ROOT = join(SCRIPT_DIR, '..');
const SRC_DIR = join(EXT_ROOT, 'src');
const BASELINE_PATH = join(EXT_ROOT, 'scripts', '.no-hex-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// Rules: pattern name → regex that matches a bare color literal.
// Each regex is applied to the full source line AFTER stripping var(…) fallback regions.
const RULES = [
  // Exclude HTML numeric character references (&#NNN; / &#xHHH;) by requiring
  // the # to NOT be preceded by & — use a negative lookbehind.
  { name: 'hex-literal', re: /(?<!&)#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgba-literal', re: /rgba?\s*\(/ },
  { name: 'hsla-literal', re: /hsla?\s*\(/ },
  {
    name: 'named-color-prop',
    re: /(?:^|;|\{)\s*(?:color|background(?:-color)?|border(?:-\w+)?-color|outline(?:-color)?|box-shadow|text-decoration-color|caret-color|fill|stroke)\s*:\s*(?!var\()(?!transparent)(?!inherit)(?!initial)(?!currentColor)(?!none)[a-z]{3,}/,
  },
];

// File-level exemptions: skip the whole file if path matches any pattern.
const FILE_EXEMPTIONS = [
  /[/\\]src[/\\]__tests__[/\\]/,
  /[/\\]src[/\\]test[/\\]/,
  /DecorationProvider/,
  /[/\\]out[/\\]/,
];

// Remove  var(--token, <anything-up-to-close-paren>)  regions from a line
// before testing, so fallback values don't trigger the gate.
function stripVarFallbacks(line) {
  // Replace var( ... ) with var() — iteratively to handle nested
  let prev;
  let s = line;
  do {
    prev = s;
    s = s.replace(/var\([^()]*\)/g, 'var()');
  } while (s !== prev);
  return s;
}

// Extract the matched literal text from a line for the report.
function extractLiteral(line, rule) {
  const m = line.match(rule.re);
  return m ? m[0].trim().slice(0, 60) : '';
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|html|css)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isExemptFile(absPath) {
  return FILE_EXEMPTIONS.some((re) => re.test(absPath));
}

function scanFile(absPath) {
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const stripped = stripVarFallbacks(rawLine);

    for (const rule of RULES) {
      if (rule.re.test(stripped)) {
        findings.push({
          file: 'apps/extension-vscode/' + relative(EXT_ROOT, absPath),
          line: i + 1,
          literal: extractLiteral(stripped, rule),
          rule: rule.name,
        });
      }
    }
  }
  return findings;
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).violations ?? [];
  } catch {
    return [];
  }
}

function baselineKey(v) {
  return `${v.file}:${v.line}`;
}

function run() {
  const files = walk(SRC_DIR).filter((f) => !isExemptFile(f));
  const allViolations = [];

  for (const f of files) {
    allViolations.push(...scanFile(f));
  }

  if (UPDATE_BASELINE) {
    const out = { violations: allViolations };
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(
      `Baseline updated: ${allViolations.length} violation(s) written to ${BASELINE_PATH}`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();
  const baselineKeys = new Set(baseline.map(baselineKey));

  const newViolations = allViolations.filter((v) => !baselineKeys.has(baselineKey(v)));

  if (newViolations.length === 0) {
    console.log(`check:vscode-theme-tokens — PASS (${allViolations.length} grandfathered, 0 new)`);
    process.exit(0);
  }

  console.error(
    `check:vscode-theme-tokens — FAIL: ${newViolations.length} new hardcoded color literal(s) found.\n`,
  );
  console.error(`Recommendation: use var(--vscode-*) theme tokens instead.`);
  console.error(`Reference: https://code.visualstudio.com/api/references/theme-color\n`);
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  "${v.literal}"`);
  }
  console.error(`\nTo grandfather an intentional exception, run:`);
  console.error(
    `  node apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs --update-baseline`,
  );
  process.exit(1);
}

run();
