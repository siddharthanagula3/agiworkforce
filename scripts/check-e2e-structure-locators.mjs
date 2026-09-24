#!/usr/bin/env node
// A browser spec that reaches an element by walking the DOM (a parent hop, an
// nth-child position) breaks the day a harmless wrapper is added, and fails
// for a reason no reader of the product would call a regression. Specs find
// what they drive by role, label, text or test id instead.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SPEC_FILE = /\.spec\.[cm]?[jt]sx?$/;

export const STRUCTURAL_LOCATORS = [
  { pattern: /xpath=/, why: 'an XPath locator walks the DOM tree' },
  { pattern: /\.locator\(\s*(['"`])\.\.\1\s*\)/, why: 'a parent hop depends on the wrapper count' },
  { pattern: /:nth-(?:child|of-type)\(/, why: 'a positional selector depends on sibling order' },
];

export function findStructuralLocators(source) {
  const findings = [];
  source.split('\n').forEach((line, index) => {
    for (const { pattern, why } of STRUCTURAL_LOCATORS) {
      if (pattern.test(line)) findings.push({ line: index + 1, why });
    }
  });
  return findings;
}

export function specFiles(root) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return listed
    .split('\n')
    .filter((file) => SPEC_FILE.test(file) && !file.includes('node_modules/'));
}

export function checkE2eStructureLocators(root, files = specFiles(root)) {
  const failures = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const finding of findStructuralLocators(fs.readFileSync(full, 'utf8'))) {
      failures.push(
        `${file}:${finding.line}: ${finding.why}; locate it by role, label or test id.`,
      );
    }
  }
  return { failures, scanned: files.length };
}

function main() {
  const { failures, scanned } = checkE2eStructureLocators(repoRoot);
  if (failures.length > 0) {
    console.error('Browser specs that reach elements through the DOM structure:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`check-e2e-structure-locators: ${scanned} specs locate what they drive by meaning.`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
