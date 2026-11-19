#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_MAX_BUFFER } from './lib/git-output.mjs';

const root = process.cwd();

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.rs', '.ts', '.tsx']);
const MANIFEST_BASENAMES = new Set(['package.json', 'Cargo.toml']);
// A guard and its test have to spell out the shapes they reject.
const EXEMPT_FILES = new Set([
  'scripts/check-llm-failure-guardrails.mjs',
  'scripts/check-llm-failure-guardrails.test.mjs',
  'scripts/check-raw-html-sinks.test.mjs',
  'scripts/lib/raw-html-sinks.mjs',
  'scripts/check-test-integrity.mjs',
  'scripts/check-test-integrity.test.mjs',
]);
const EXEMPT_PATH_PREFIXES = [];
const TAXONOMY_PATH = 'docs/agent-context/llm-failure-taxonomy.json';
const SKIP_RATCHET_PATH = 'scripts/config/skipped-test-ratchet.json';

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
  {
    regex:
      /\bexpect\s*\(\s*(true|false|0|1|''|"")\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)/g,
    label: 'a literal compared against itself asserts nothing about the code under test',
  },
  {
    regex: /\bexpect\s*\(\s*(?:true|1)\s*\)\s*\.\s*(?:toBeTruthy|toBeDefined)\s*\(/g,
    label: 'expect(<truthy literal>).toBeTruthy() asserts nothing',
  },
  {
    regex: /\bassert_eq!\s*\(\s*([\w.]+)\s*,\s*\1\s*[,)]/g,
    label: 'assert_eq! compares a value against itself',
  },
  {
    regex: /\.\s*(?:toEqual|toBe|toStrictEqual)\s*\(\s*expect\s*\.\s*anything\s*\(\s*\)\s*\)/g,
    label: 'toEqual(expect.anything()) accepts every value but undefined and null',
  },
  {
    regex: /\.\s*length\s*\)\s*\.\s*toBeGreaterThanOrEqual\s*\(\s*0\s*\)/g,
    label: 'a length is never below zero, so this assertion passes on an empty result',
  },
  {
    regex: /\.\s*toContain\s*\(\s*(?:''|"")\s*\)/g,
    label: 'every string contains the empty string',
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

const SKIP_CENSUS_PATTERNS = [
  {
    regex: /\b(?:describe|it|test)\.skip(?:If)?\s*\(/g,
    kind: 'js-skip',
  },
  {
    regex: /#\s*\[\s*ignore\s*(?:=\s*"([^"]*)")?\s*\]/g,
    kind: 'rust-ignore',
  },
];

function gitText(args, cwd = root) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: GIT_MAX_BUFFER,
    });
  } catch (error) {
    throw new Error(`Git ${args[0]} failed (${error.code ?? error.status ?? 'unknown'})`);
  }
}

export function gitFiles(args, cwd = root) {
  return gitText(args, cwd)
    .split('\0')
    .filter(Boolean)
    .map((file) => path.join(cwd, file));
}

const workingReader = {
  exists: existsSync,
  read: (file) => readFileSync(file, 'utf8'),
};

export function stagedReader(cwd = root) {
  const blobs = new Map();
  const indexEntries = () => gitText(['ls-files', '--stage', '-z'], cwd);
  const entries = indexEntries();
  for (const entry of entries.split('\0').filter(Boolean)) {
    const match = /^\d+ ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(entry);
    if (!match || match[2] !== '0') throw new Error('Staged guard requires a fully merged index');
    blobs.set(path.join(cwd, match[3]), match[1]);
  }
  return {
    exists: (file) => blobs.has(file),
    assertUnchanged: () => {
      if (entries !== indexEntries()) throw new Error('Staged index changed during validation');
    },
    read: (file) => {
      const blob = blobs.get(file);
      if (!blob) throw new Error(`Missing staged input: ${path.relative(cwd, file)}`);
      return gitText(['cat-file', 'blob', blob], cwd);
    },
  };
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

function isAllowedByAnnotation(lines, lineNo) {
  for (let i = lineNo - 2; i <= lineNo + 2; i++) {
    const line = lines[i - 1];
    if (line !== undefined && /llm-guardrail-allow:/.test(line)) return true;
  }
  return false;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#[') || trimmed.startsWith('#![')) return false;
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('#')
  );
}

function collectPatternViolations(
  files,
  patterns,
  { productionOnly = false, reader = workingReader } = {},
) {
  const violations = [];
  for (const file of files) {
    const relativePath = rel(file);
    if (EXEMPT_FILES.has(relativePath)) continue;
    if (isExemptPath(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    if (productionOnly && !isProductionPath(relativePath)) continue;
    const text = reader.read(file);
    const lines = text.split('\n');
    for (const { regex, label } of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const lineNo = lineForOffset(text, match.index);
        if (isAllowedByAnnotation(lines, lineNo)) continue;
        if (isCommentLine(lines[lineNo - 1] ?? '')) continue;
        violations.push(`${relativePath}:${lineNo} ${label}`);
      }
    }
  }
  return violations;
}

export function scanSkipSites(relativePath, text) {
  const sites = [];
  const lines = text.split('\n');
  for (const { regex, kind } of SKIP_CENSUS_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lineNo = lineForOffset(text, match.index);
      if (isCommentLine(lines[lineNo - 1] ?? '')) continue;
      const reason = match[1];
      const justification =
        kind === 'rust-ignore' && typeof reason === 'string' && reason.trim() !== ''
          ? 'reason'
          : isAllowedByAnnotation(lines, lineNo)
            ? 'annotated'
            : 'none';
      sites.push({ path: relativePath, line: lineNo, kind, justification });
    }
  }
  return sites.sort((a, b) => a.line - b.line);
}

function collectSkipCensus(files, reader = workingReader) {
  const sites = [];
  for (const file of files) {
    const relativePath = rel(file);
    if (EXEMPT_FILES.has(relativePath)) continue;
    if (isExemptPath(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    sites.push(...scanSkipSites(relativePath, reader.read(file)));
  }
  return sites.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

export function unjustifiedByPath(sites) {
  const counts = new Map();
  for (const site of sites) {
    if (site.justification !== 'none') continue;
    counts.set(site.path, (counts.get(site.path) ?? 0) + 1);
  }
  return counts;
}

export function summarizeSkipCensus(sites) {
  const tally = { total: sites.length, reason: 0, annotated: 0, unjustified: 0 };
  for (const site of sites) {
    if (site.justification === 'reason') tally.reason += 1;
    else if (site.justification === 'annotated') tally.annotated += 1;
    else tally.unjustified += 1;
  }
  return tally;
}

export function validateSkipRatchet(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return [`${SKIP_RATCHET_PATH} must be a JSON object`];
  }
  if (!Array.isArray(config.debt)) {
    return [`${SKIP_RATCHET_PATH} must declare a "debt" array`];
  }
  const errors = [];
  const seen = new Set();
  for (const [index, entry] of config.debt.entries()) {
    const prefix = `${SKIP_RATCHET_PATH} debt[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      errors.push(`${prefix} must name a path`);
    } else if (seen.has(entry.path)) {
      errors.push(`${prefix} duplicates path ${entry.path}`);
    } else {
      seen.add(entry.path);
    }
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      errors.push(`${prefix} count must be a positive integer`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      errors.push(`${prefix} must record a reason of at least 20 characters`);
    }
    if (typeof entry.trackedBy !== 'string' || entry.trackedBy.trim() === '') {
      errors.push(`${prefix} must name a tracking id`);
    }
  }
  return errors;
}

export function diffSkipRatchet(actual, debt, { detectStale = true } = {}) {
  const declared = new Map();
  for (const entry of debt) {
    if (!entry || typeof entry.path !== 'string') continue;
    declared.set(entry.path, (declared.get(entry.path) ?? 0) + (entry.count ?? 0));
  }
  const violations = [];
  for (const file of [...actual.keys()].sort()) {
    const count = actual.get(file);
    const allowed = declared.get(file) ?? 0;
    if (count > allowed) {
      violations.push(
        `${file} has ${count} undeclared skipped/ignored test(s) (${allowed} declared in ${SKIP_RATCHET_PATH}), give each an inline reason, an llm-guardrail-allow: annotation, or declare it as tracked debt`,
      );
    }
  }
  if (!detectStale) return violations;
  for (const file of [...declared.keys()].sort()) {
    const allowed = declared.get(file);
    const count = actual.get(file) ?? 0;
    if (count < allowed) {
      violations.push(
        `${SKIP_RATCHET_PATH} declares ${allowed} unjustified skip(s) for ${file} but ${count} reproduce, lower the count, this list only ratchets down`,
      );
    }
  }
  return violations;
}

function collectSkipRatchetViolations(sites, { detectStale, reader = workingReader }) {
  const full = path.join(root, SKIP_RATCHET_PATH);
  if (!reader.exists(full)) return [`${SKIP_RATCHET_PATH} missing`];
  let config;
  try {
    config = JSON.parse(reader.read(full));
  } catch (error) {
    return [`${SKIP_RATCHET_PATH} invalid JSON: ${error.message}`];
  }
  const errors = validateSkipRatchet(config);
  if (errors.length > 0) return errors;
  return diffSkipRatchet(unjustifiedByPath(sites), config.debt, { detectStale });
}

function collectManifestViolations(files, reader = workingReader) {
  const violations = [];
  for (const file of files) {
    if (!MANIFEST_BASENAMES.has(path.basename(file))) continue;
    const relativePath = rel(file);
    if (path.basename(file) === 'package.json') {
      const text = reader.read(file);
      let pkg;
      try {
        pkg = JSON.parse(text);
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

function collectTaxonomyViolations(reader = workingReader) {
  const violations = [];
  const full = path.join(root, TAXONOMY_PATH);
  if (!reader.exists(full)) {
    return [`${TAXONOMY_PATH} missing`];
  }
  let taxonomy;
  try {
    taxonomy = JSON.parse(reader.read(full));
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

function collectVitestDrift(files, reader = workingReader) {
  const violations = [];
  for (const file of files) {
    if (path.basename(file) !== 'package.json') continue;
    const relativePath = rel(file);
    const text = reader.read(file);
    let pkg;
    try {
      pkg = JSON.parse(text);
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
  if (reader.exists(lockfile)) {
    const lock = reader.read(lockfile);
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

export function main(argv = process.argv.slice(2)) {
  const strictMode = argv.includes('--strict');
  const changedMode = argv.includes('--changed');
  const stagedMode = argv.includes('--staged');
  const wholeTree = !changedMode && !stagedMode;

  const reader = stagedMode ? stagedReader() : workingReader;
  const discovered = stagedMode
    ? gitFiles(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRTUXB'])
    : changedMode
      ? gitFiles(['diff', '--name-only', '-z', '--diff-filter=ACMRTUXB', 'HEAD'])
      : gitFiles(['ls-files', '-c', '-o', '--exclude-standard', '-z']);

  const files = stagedMode ? discovered : discovered.filter((file) => reader.exists(file));
  const census = collectSkipCensus(files, reader);
  const tally = summarizeSkipCensus(census);

  const violations = [
    ...collectTaxonomyViolations(reader),
    ...collectPatternViolations(files, TEST_THEATER_PATTERNS, { reader }),
    ...collectPatternViolations(files, PRODUCTION_STUB_PATTERNS, { productionOnly: true, reader }),
    ...collectVitestDrift(files, reader),
    ...collectSkipRatchetViolations(census, { detectStale: wholeTree, reader }),
  ];

  if (strictMode || changedMode || stagedMode) {
    violations.push(...collectPatternViolations(files, STRICT_SOURCE_PATTERNS, { reader }));
    violations.push(
      ...collectPatternViolations(files, STRICT_PRODUCTION_PATTERNS, {
        productionOnly: true,
        reader,
      }),
    );
    violations.push(...collectManifestViolations(files, reader));
  }

  reader.assertUnchanged?.();

  console.log(
    `skip census (${stagedMode ? 'staged index' : wholeTree ? 'whole tree' : 'changed files'}): ${tally.total} skipped/ignored test site(s), ` +
      `${tally.reason} with an inline reason, ${tally.annotated} annotated, ${tally.unjustified} unjustified`,
  );

  if (violations.length > 0) {
    console.error('check:llm-failures FAIL');
    for (const violation of violations) console.error(`- ${violation}`);
    return 1;
  }

  console.log('check:llm-failures PASS');
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) process.exit(main());
