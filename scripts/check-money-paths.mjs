#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';

// Money is stored in whole minor units: integer cents, integer microUSD. A
// binary float cannot hold a tenth of a cent exactly, so every fraction that
// reaches a money column is a rounding error the ledger then treats as a
// measurement. The columns themselves are the source of truth for which
// tables are money, and the tree is the source of truth for who writes them.
const MONEY_COLUMN = /_(?:cents|microusd)$/;

export function moneyTables(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const tables = new Set();
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '');
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi,
    )) {
      const columns = [...match[2].matchAll(/^\s*([a-z0-9_]+)\s/gim)].map((entry) => entry[1]);
      if (columns.some((column) => MONEY_COLUMN.test(column))) tables.add(match[1]);
    }
    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi,
    )) {
      if (MONEY_COLUMN.test(match[2])) tables.add(match[1]);
    }
  }
  return [...tables].sort();
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const SKIP_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'generated',
  'target',
]);

export function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|fixtures|e2e)\//.test(relativePath)
  );
}

export function moneyWriterPattern(tables) {
  if (tables.length === 0) return /(?!)/;
  return new RegExp(`(?:insert\\s+into|update)\\s+(?:public\\.)?(?:${tables.join('|')})\\b`, 'i');
}

/** Every module that writes a money column, read out of the tree rather than listed. */
export function discoverMoneyPathFiles({ repoRoot = REPO_ROOT, filePaths, tables }) {
  const writes = moneyWriterPattern(tables ?? moneyTables(repoRoot));
  const found = [];
  for (const filePath of [...new Set(filePaths)].sort()) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;
    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (writes.test(text)) found.push({ file: relativePath, text });
  }
  return found;
}

const MONEY_IDENTIFIER =
  /\b[A-Za-z_$][A-Za-z0-9_$]*(?:[Cc]ents|[Mm]icrousd|[Mm]icroUsd|[Mm]icroUSD|_cents|_microusd)\b/;

// A name that states the result is a whole minor unit. Arithmetic that goes
// through one of these has already decided how the fraction was resolved.
const ROUNDING_HELPER =
  /\b(?:Math\.(?:round|floor|ceil|trunc|max|min|abs)|[A-Za-z]*[Rr]ound[A-Za-z]*|[A-Za-z]*[Cc]eil[A-Za-z]*|[A-Za-z]*[Ff]loor[A-Za-z]*|[A-Za-z]*[Tt]runc[A-Za-z]*|microusdFrom[A-Za-z]*|centsFrom[A-Za-z]*|ledgerCentsFrom[A-Za-z]*|[A-Za-z]*To[Mm]icro[Uu]sd|prorate[A-Za-z]*|[A-Z][A-Z0-9_]*_PER_[A-Z0-9_]*)\b/;

const HAZARDS = Object.freeze([
  {
    kind: 'float parser',
    why: 'a money column holds whole minor units; parseFloat accepts a fraction it cannot store',
    test: (line) => /\bparseFloat\s*\(/.test(line),
  },
  {
    kind: 'rounded by formatting',
    why: 'toFixed decides a money value by printing it; round in minor units instead',
    test: (line) => /\.toFixed\s*\(/.test(line) && !/[`]|\+\s*['"]/.test(line),
  },
  {
    kind: 'fractional operand',
    why: 'a decimal literal in money arithmetic introduces a fraction of a minor unit',
    test: (line) => /[*/+-]\s*\d+\.\d+|\d+\.\d+\s*[*/]/.test(line),
  },
  {
    kind: 'unrounded rate',
    why: 'a money quantity scaled by a rate has to resolve its fraction through a rounding helper',
    test: (line) => {
      if (ROUNDING_HELPER.test(line)) return false;
      for (const match of line.matchAll(
        /([A-Za-z_$][A-Za-z0-9_$.]*)\s*([*/])\s*([A-Za-z0-9_$.]+)/g,
      )) {
        if (MONEY_IDENTIFIER.test(match[1]) || MONEY_IDENTIFIER.test(match[3])) return true;
      }
      return false;
    },
  },
]);

/**
 * Blanks the text a string or a template literal carries, keeping its quotes
 * and its `${}` expressions. SQL is exact integer arithmetic in the database
 * and a hostname is not a money value; only the JavaScript around them can
 * resolve a fraction in binary floating point.
 */
export function blankStringLiterals(source) {
  let out = '';
  let index = 0;
  const stack = [];
  while (index < source.length) {
    const character = source[index];
    const inTemplateText = stack[stack.length - 1] === '`';
    const inQuote = stack[stack.length - 1] === "'" || stack[stack.length - 1] === '"';
    if ((inTemplateText || inQuote) && character === '\\') {
      out += character === '\n' ? character : '  ';
      index += 2;
      continue;
    }
    if (inQuote && character === stack[stack.length - 1]) {
      stack.pop();
      out += character;
      index += 1;
      continue;
    }
    if (inQuote) {
      out += character === '\n' ? character : ' ';
      index += 1;
      continue;
    }
    if (inTemplateText && character === '`') {
      stack.pop();
      out += character;
      index += 1;
      continue;
    }
    if (inTemplateText && character === '$' && source[index + 1] === '{') {
      stack.push('{');
      out += '  ';
      index += 2;
      continue;
    }
    if (inTemplateText) {
      out += character === '\n' ? character : ' ';
      index += 1;
      continue;
    }
    if (character === '`' || character === "'" || character === '"') {
      stack.push(character);
      out += character;
      index += 1;
      continue;
    }
    if (character === '{' && stack.includes('{')) {
      stack.push('{');
      out += character;
      index += 1;
      continue;
    }
    if (character === '}' && stack[stack.length - 1] === '{') {
      stack.pop();
      out += ' ';
      index += 1;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}

export function findMoneyHazards(text) {
  const hazards = [];
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  const source = withoutBlocks.split('\n');
  const scanned = blankStringLiterals(withoutBlocks).split('\n');
  for (let index = 0; index < scanned.length; index += 1) {
    const line = scanned[index].replace(/\/\/.*$/, '');
    for (const hazard of HAZARDS) {
      if (hazard.test(line)) {
        hazards.push({
          line: index + 1,
          kind: hazard.kind,
          why: hazard.why,
          code: source[index].replace(/\/\/.*$/, '').trim(),
        });
      }
    }
  }
  return hazards;
}

/**
 * The hazards this repository carries today. Each one states why the fraction
 * it introduces cannot reach a money column, or who owns the fix. The guard
 * refuses a new hazard and refuses an entry that no longer matches, so this
 * list can only shrink.
 */
export const ACCEPTED_HAZARDS = Object.freeze([
  {
    file: 'apps/web/lib/services/cogs-ledger-service.ts',
    code: 'return rate.providerCogsMicrousd === null ? null : rate.providerCogsMicrousd * units;',
    reason:
      'a rate card figure scaled by fractional units (gibibyte-months, egress gibibytes); the only caller resolves it with centsFromMicrousdCeil before the ledger write',
  },
  {
    file: 'apps/web/lib/services/cogs-ledger-service.ts',
    code: 'return retailCostCents / input.actualCostCents;',
    reason: 'a ratio of two money amounts, not a money amount; nothing stores it',
  },
  {
    file: 'apps/web/lib/services/cogs-ledger-service.ts',
    code: 'costPerDeliveredTaskCents: deliveredTasks > 0 ? deliveredTaskCostCents / deliveredTasks : null,',
    reason: 'a per-task average reported to an operator; no money column receives it',
  },
  {
    file: 'apps/web/lib/services/spend-limit-service.ts',
    code: "if (typeof value === 'string') return Number.parseFloat(value) || 0;",
    reason:
      'the integer cents sum Postgres returns as a string is parsed with a float parser; the fix is an integer parser and belongs to the owner of the spend-limit service',
  },
]);

function acceptedKey(file, code) {
  return `${file}::${code.replace(/\s+/g, ' ').trim()}`;
}

export function scanMoneyPaths({ repoRoot = REPO_ROOT, filePaths, accepted = ACCEPTED_HAZARDS }) {
  const acceptedKeys = new Map(
    accepted.map((entry) => [acceptedKey(entry.file, entry.code), entry]),
  );
  const matchedKeys = new Set();
  const violations = [];
  for (const { file, text } of discoverMoneyPathFiles({ repoRoot, filePaths })) {
    for (const hazard of findMoneyHazards(text)) {
      const key = acceptedKey(file, hazard.code);
      if (acceptedKeys.has(key)) {
        matchedKeys.add(key);
        continue;
      }
      violations.push({ file, ...hazard });
    }
  }
  const stale = [...acceptedKeys.keys()].filter((key) => !matchedKeys.has(key));
  return { violations, stale };
}

export function discoverRepositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : REPO_ROOT;
  const tables = moneyTables(repoRoot);
  if (tables.length === 0) {
    console.error(`No money tables found under ${MIGRATIONS_DIR}`);
    process.exitCode = 1;
    return;
  }
  const { violations, stale } = scanMoneyPaths({
    repoRoot,
    filePaths: discoverRepositoryFiles(repoRoot),
  });

  if (violations.length > 0) {
    console.error(
      'A module that writes money to the database resolves a fraction in floating point:\n',
    );
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}  ${violation.kind}`);
      console.error(`    ${violation.code}`);
      console.error(`    ${violation.why}`);
    }
  }
  if (stale.length > 0) {
    console.error('\nThese accepted hazards no longer match the code; remove them:\n');
    for (const key of stale) console.error(`  ${key}`);
  }
  if (violations.length > 0 || stale.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `check-money-paths: no float on a money path (${tables.length} money tables, ${ACCEPTED_HAZARDS.length} accepted)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
