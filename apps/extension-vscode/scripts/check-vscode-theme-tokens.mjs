#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const EXT_ROOT = join(SCRIPT_DIR, '..');
const SRC_DIR = join(EXT_ROOT, 'src');
const BASELINE_PATH = join(EXT_ROOT, 'scripts', '.no-hex-baseline.json');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const RULES = [
  { name: 'hex-literal', re: /(?<!&)#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgba-literal', re: /rgba?\s*\(/ },
  { name: 'hsla-literal', re: /hsla?\s*\(/ },
  {
    name: 'named-color-prop',
    re: /(?:^|;|\{)\s*(?:color|background(?:-color)?|border(?:-\w+)?-color|outline(?:-color)?|box-shadow|text-decoration-color|caret-color|fill|stroke)\s*:\s*(?!var\()(?!transparent)(?!inherit)(?!initial)(?!currentColor)(?!none)[a-z]{3,}/,
  },
];

const FILE_EXEMPTIONS = [
  /[/\\]src[/\\]__tests__[/\\]/,
  /[/\\]src[/\\]test[/\\]/,
  /DecorationProvider/,
  /[/\\]out[/\\]/,
];

function stripVarFallbacks(line) {
  let prev;
  let s = line;
  do {
    prev = s;
    s = s.replace(/var\([^()]*\)/g, 'var()');
  } while (s !== prev);
  return s;
}

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
