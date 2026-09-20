#!/usr/bin/env node

// A closed vocabulary is closed only where the compiler can see it. Every value
// that arrives from a form, a request body, a column or a JSON file is a string
// until something admits it. This guard reads each governed vocabulary out of
// the tree, fails on a member declared twice, and fails on a cast that turns an
// unchecked string into a member the rest of the product then trusts.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/registry-reference-contract.json';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** `Object.keys(record) as Member[]` reads the vocabulary rather than inventing one. */
const KEYS_OF_RECORD = /Object\.(?:keys|entries)\s*\([^)]*\)\s*$/;

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function repositoryFiles(repoRoot) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

/** Members as declared, duplicates included, so a repeat is visible. */
export function readMembers({ repoRoot, vocabulary }) {
  if (vocabulary.jsonKeys !== undefined) {
    const raw = readSource(repoRoot, vocabulary.file);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const bucket = parsed[vocabulary.jsonKeys];
    if (bucket === undefined || bucket === null) return null;
    return Array.isArray(bucket) ? bucket.map((entry) => entry.id ?? entry) : Object.keys(bucket);
  }

  const source = readSource(repoRoot, vocabulary.file);
  if (source === null) return null;
  const array = new RegExp(`export const ${vocabulary.symbol}(?:[^=]*)= \\[([\\s\\S]*?)\\]`).exec(
    source,
  );
  const union = new RegExp(`export type ${vocabulary.symbol} =([\\s\\S]*?);`).exec(source);
  const block = array?.[1] ?? union?.[1];
  if (block === undefined) return null;
  const members = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return members.length === 0 ? null : members;
}

/** Every cast into a governed type, with the line it is written on. */
export function findUncheckedCasts({ repoRoot, files, roots, types }) {
  const matcher = new RegExp(`\\bas\\s+(?:unknown\\s+as\\s+)?(${types.join('|')})\\b`, 'g');
  const found = [];
  for (const relativePath of files) {
    if (!roots.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    matcher.lastIndex = 0;
    let match;
    while ((match = matcher.exec(source)) !== null) {
      const before = source.slice(Math.max(0, match.index - 120), match.index);
      if (KEYS_OF_RECORD.test(before)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      found.push({ file: relativePath, type: match[1], line });
    }
  }
  return found;
}

function checkVocabularies({ contract, repoRoot, errors, report }) {
  for (const vocabulary of contract.vocabularies) {
    const where = `${CONTRACT_PATH}#${vocabulary.name}`;
    const members = readMembers({ repoRoot, vocabulary });
    if (members === null) {
      errors.push(
        `${vocabulary.file}: the ${vocabulary.name} vocabulary is no longer readable, so every ` +
          'reference to it resolves against nothing.',
      );
      continue;
    }
    report.members += members.length;

    const seen = new Set();
    for (const member of members) {
      if (seen.has(member)) {
        errors.push(
          `${vocabulary.file}: the ${vocabulary.name} vocabulary declares "${member}" twice. Two ` +
            'entries with one id means whichever is read last decides, and which is read last is an ' +
            'ordering nobody owns.',
        );
      }
      seen.add(member);
    }

    const predicateFile = vocabulary.predicateFile ?? vocabulary.file;
    if (vocabulary.predicate !== null) {
      const source = readSource(repoRoot, predicateFile);
      if (
        source === null ||
        !new RegExp(`export function ${vocabulary.predicate}\\b`).test(source)
      ) {
        errors.push(
          `${predicateFile}: no longer exports ${vocabulary.predicate}, so nothing admits a string ` +
            `into the ${vocabulary.name} vocabulary.`,
        );
      }
      if (vocabulary.predicateGap !== undefined) {
        errors.push(`${where}: has a predicate and records a gap for one at the same time.`);
      }
      continue;
    }

    const gap = vocabulary.predicateGap;
    if (gap === undefined) {
      errors.push(
        `${where}: owns no predicate and records no gap, so a value from outside the build enters ` +
          'this vocabulary unchecked.',
      );
      continue;
    }
    for (const field of ['why', 'fix']) {
      if (typeof gap[field] !== 'string' || gap[field].trim().length === 0) {
        errors.push(`${where}: the predicate gap carries no ${field}.`);
      }
    }
    const source = readSource(repoRoot, predicateFile);
    if (source !== null && new RegExp(`export function is${vocabulary.type}\\b`).test(source)) {
      errors.push(
        `${where}: the predicate gap is stale, ${predicateFile} now exports is${vocabulary.type}.`,
      );
    }
    report.predicateGaps += 1;
  }
}

function checkCasts({ contract, repoRoot, files, errors, report }) {
  const types = contract.vocabularies.map((vocabulary) => vocabulary.type);
  const casts = findUncheckedCasts({ repoRoot, files, roots: contract.castRoots, types });
  const recorded = new Map(
    (contract.castDefects ?? []).map((entry) => [`${entry.file}#${entry.type}`, entry]),
  );
  const seen = new Set();
  report.casts = casts.length;

  for (const cast of casts) {
    const key = `${cast.file}#${cast.type}`;
    const defect = recorded.get(key);
    if (defect === undefined) {
      errors.push(
        `${cast.file}:${cast.line}: casts a value into ${cast.type} rather than admitting it. A member ` +
          'the vocabulary never had is then believed everywhere downstream. Use the vocabulary predicate, ' +
          `or record the cast in ${CONTRACT_PATH} with the change that removes it.`,
      );
      continue;
    }
    seen.add(key);
    for (const field of ['why', 'fix']) {
      if (typeof defect[field] !== 'string' || defect[field].trim().length === 0) {
        errors.push(`${CONTRACT_PATH}: the ${key} cast defect carries no ${field}.`);
      }
    }
    report.castDefects += 1;
  }

  for (const key of recorded.keys()) {
    if (seen.has(key)) continue;
    errors.push(
      `${CONTRACT_PATH}: the ${key} cast defect no longer matches a cast. Delete it; this list only shrinks.`,
    );
  }
}

export function checkRegistryReferences(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = repositoryFiles(repoRoot);
  const report = {
    vocabularies: contract.vocabularies.length,
    members: 0,
    casts: 0,
    castDefects: 0,
    predicateGaps: 0,
  };

  checkVocabularies({ contract, repoRoot, errors, report });
  checkCasts({ contract, repoRoot, files, errors, report });

  return { errors, report };
}

function main() {
  const { errors, report } = checkRegistryReferences(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Registry reference check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-registry-references: OK (${report.vocabularies} governed vocabularies, ${report.members} ` +
      `members, ${report.casts} cast(s) of which ${report.castDefects} recorded, ` +
      `${report.predicateGaps} vocabulary(ies) still without a predicate)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
