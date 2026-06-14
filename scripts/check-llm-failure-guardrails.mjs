#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strictMode = process.argv.includes('--strict');
const changedMode = process.argv.includes('--changed');
const stagedMode = process.argv.includes('--staged');

const SKIP_DIRS = new Set([
  '.agent',
  '.git',
  '.next',
  '.vercel',
  '.vscode-test',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'Pods',
  'dist-web',
  'playwright-report',
  'test-results',
]);

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.rs', '.ts', '.tsx']);
const MANIFEST_BASENAMES = new Set(['package.json', 'Cargo.toml']);
const EXEMPT_FILES = new Set(['scripts/check-llm-failure-guardrails.mjs']);
const EXEMPT_PATH_PREFIXES = ['docs/archive/'];
const TAXONOMY_PATH = 'docs/agent-context/llm-failure-taxonomy.json';

const TEST_THEATER_PATTERNS = [
  {
    regex: /\bexpect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/g,
    label: 'expect(true).toBe(true)',
  },
  {
    regex: /\bassert_eq!\s*\(\s*true\s*,/g,
    label: 'assert_eq!(true, ...)',
  },
  {
    regex: /\bassert!\s*\(\s*true\s*\)/g,
    label: 'assert!(true)',
  },
];

const PRODUCTION_STUB_PATTERNS = [
  {
    regex: /\bthrow\s+new\s+Error\s*\(\s*['"`][Nn]ot implemented/g,
    label: 'throw new Error("not implemented")',
  },
  {
    regex: /\btodo!\s*\(/g,
    label: 'todo!() macro',
  },
  {
    regex: /\bunimplemented!\s*\(/g,
    label: 'unimplemented!() macro',
  },
];

const STRICT_PRODUCTION_PATTERNS = [
  {
    regex:
      /\b(?:TODO|FIXME|HACK|XXX)\b[^\n]*(?:implement|wire|finish|later|placeholder|stub|fake|mock|temporary|coming soon)/gi,
    label: 'production placeholder TODO/FIXME/HACK',
  },
  {
    regex: /\b(?:pseudo|pretend|simulated|fake)\s+implementation\b/gi,
    label: 'fake implementation wording in production source',
  },
  {
    regex: /\b(?:implementation|compile|green check)\s+theater\b/gi,
    label: 'implementation/compile/green-check theater wording in production source',
  },
  {
    regex: /\b(?:dummy|mock|fake)\s+(?:response|user|implementation)\b/gi,
    label: 'production dummy/mock/fake response marker',
  },
];

const STRICT_SOURCE_PATTERNS = [
  {
    regex: /\b(?:describe|it|test)\.skip(?:If)?\s*\(/g,
    label: 'skipped test or conditional skipped test',
  },
  {
    regex: /#\s*\[\s*ignore\s*\]/g,
    label: 'ignored Rust test',
  },
  {
    regex: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    label: 'empty catch block',
  },
  {
    regex: /\b(?:eval|Function)\s*\(/g,
    label: 'dynamic code execution sink',
  },
  {
    regex: /\bdangerouslySetInnerHTML\b/g,
    label: 'raw HTML rendering sink',
  },
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function gitFiles(args) {
  try {
    const out = execSync(`git ${args}`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((file) => path.join(root, file))
      .filter((file) => existsSync(file));
  } catch {
    return [];
  }
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function isProductionPath(relativePath) {
  return (
    !/(^|\/)(__tests__|__mocks__|e2e|test|tests)(\/|$)/.test(relativePath) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function isExemptPath(relativePath) {
  return EXEMPT_PATH_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

// A single flagged line may be explicitly allowed when it is provably safe by
// inspection (e.g. a sink fed only sanitized input). The allowance must be a
// justification comment — `llm-guardrail-allow: <reason>` — on the matched line
// or the line directly above it, so every exemption is auditable in the diff.
function isAllowedByAnnotation(lines, lineNo) {
  // Check the matched line plus two lines on either side, so the justification
  // survives formatter reflow of the surrounding expression (e.g. prettier
  // wrapping a JSX attribute value across several lines).
  for (let i = lineNo - 2; i <= lineNo + 2; i++) {
    const line = lines[i - 1];
    if (line !== undefined && /llm-guardrail-allow:/.test(line)) return true;
  }
  return false;
}

function collectPatternViolations(files, patterns, { productionOnly = false } = {}) {
  const violations = [];
  for (const file of files) {
    const relativePath = rel(file);
    if (EXEMPT_FILES.has(relativePath)) continue;
    if (isExemptPath(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    if (productionOnly && !isProductionPath(relativePath)) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (const { regex, label } of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const lineNo = lineForOffset(text, match.index);
        if (isAllowedByAnnotation(lines, lineNo)) continue;
        violations.push(`${relativePath}:${lineNo} ${label}`);
      }
    }
  }
  return violations;
}

function collectManifestViolations(files) {
  const violations = [];
  for (const file of files) {
    if (!MANIFEST_BASENAMES.has(path.basename(file))) continue;
    const relativePath = rel(file);
    if (path.basename(file) === 'package.json') {
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        const deps = pkg[section];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, version] of Object.entries(deps)) {
          if (typeof version !== 'string') continue;
          if (version === '*' || version === 'latest' || /^[xX]$/.test(version)) {
            violations.push(`${relativePath} ${section}.${name}=${version} unpinned dependency`);
          }
        }
      }
    }
  }
  return violations;
}

function collectTaxonomyViolations() {
  const violations = [];
  const full = path.join(root, TAXONOMY_PATH);
  if (!existsSync(full)) {
    return [`${TAXONOMY_PATH} missing`];
  }
  let taxonomy;
  try {
    taxonomy = JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    return [`${TAXONOMY_PATH} invalid JSON: ${error.message}`];
  }
  if (
    !Array.isArray(taxonomy.highestSignalKeywords) ||
    taxonomy.highestSignalKeywords.length < 50
  ) {
    violations.push(`${TAXONOMY_PATH} highestSignalKeywords must contain at least 50 entries`);
  }
  if (!Array.isArray(taxonomy.categories) || taxonomy.categories.length < 28) {
    violations.push(`${TAXONOMY_PATH} categories must cover all 28 failure groups`);
  }
  for (const [idx, category] of (taxonomy.categories ?? []).entries()) {
    const prefix = `${TAXONOMY_PATH} categories[${idx}]`;
    if (!category.id || !category.name) violations.push(`${prefix} missing id/name`);
    if (!Array.isArray(category.keywords) || category.keywords.length === 0) {
      violations.push(`${prefix} must list keywords`);
    }
    if (!Array.isArray(category.preventWith) || category.preventWith.length === 0) {
      violations.push(`${prefix} must list prevention controls`);
    }
  }
  return violations;
}

function collectVitestDrift(files) {
  const violations = [];
  for (const file of files) {
    if (path.basename(file) !== 'package.json') continue;
    const relativePath = rel(file);
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg[section];
      if (!deps || typeof deps !== 'object') continue;
      for (const name of ['vitest', '@vitest/ui', '@vitest/coverage-v8']) {
        const version = deps[name];
        if (typeof version !== 'string') continue;
        if (/^\^?3\.|^\^?4\.0\.|3\.2\.4|4\.0\.18/.test(version)) {
          violations.push(`${relativePath} ${section}.${name}=${version}`);
        }
      }
    }
  }

  const lockfile = path.join(root, 'pnpm-lock.yaml');
  if (existsSync(lockfile)) {
    const lock = readFileSync(lockfile, 'utf8');
    const lockPatterns = [/vitest@3\.2\.4/g, /vitest@4\.0\.18/g];
    for (const regex of lockPatterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(lock)) !== null) {
        violations.push(`pnpm-lock.yaml:${lineForOffset(lock, match.index)} ${match[0]}`);
      }
    }
  }
  return violations;
}

const files = stagedMode
  ? gitFiles('diff --cached --name-only --diff-filter=ACMRTUXB')
  : changedMode
    ? gitFiles('diff --name-only --diff-filter=ACMRTUXB HEAD')
    : walk(root);

const violations = [
  ...collectTaxonomyViolations(),
  ...collectPatternViolations(files, TEST_THEATER_PATTERNS),
  ...collectPatternViolations(files, PRODUCTION_STUB_PATTERNS, { productionOnly: true }),
  ...collectVitestDrift(files),
];

if (strictMode || changedMode || stagedMode) {
  violations.push(...collectPatternViolations(files, STRICT_SOURCE_PATTERNS));
  violations.push(
    ...collectPatternViolations(files, STRICT_PRODUCTION_PATTERNS, { productionOnly: true }),
  );
  violations.push(...collectManifestViolations(files));
}

if (violations.length > 0) {
  console.error('check:llm-failures FAIL');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('check:llm-failures PASS');
