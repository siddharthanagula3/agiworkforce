#!/usr/bin/env node

// One word, one meaning. Every term resolves to the single artifact that owns
// it, so two words cannot both be canonical for one thing and one word cannot
// quietly own two. The retired spellings are checked against the route tree,
// the migration history and the prompts, which is where a short form gets in.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readTableColumns } from './check-resource-metadata.mjs';
import { loadRegistry } from './check-concept-registry.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/terminology.json';

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

function ownerKey(owns) {
  return owns.kind === 'vocabulary'
    ? `${owns.kind}:${owns.file}#${owns.symbol}`
    : `${owns.kind}:${owns.key}`;
}

function resolveOwner({ owns, repoRoot, registry, tables }) {
  if (owns.kind === 'columnRole') {
    return registry.columnContract.roles[owns.key] === undefined
      ? `the column contract names no ${owns.key} role`
      : null;
  }
  if (owns.kind === 'table') {
    return tables.has(owns.key) ? null : `no migration creates ${owns.key}`;
  }
  if (owns.kind === 'concept') {
    return registry.concepts.some((concept) => concept.name === owns.key)
      ? null
      : `the concept registry defines no "${owns.key}"`;
  }
  if (owns.kind === 'vocabulary') {
    const source = readSource(repoRoot, owns.file);
    if (source === null) return `${owns.file} does not exist`;
    const declared =
      new RegExp(`export const ${owns.symbol}\\b`).test(source) ||
      new RegExp(`export type ${owns.symbol}\\b`).test(source);
    return declared ? null : `${owns.file} no longer declares ${owns.symbol}`;
  }
  return `unknown owner kind "${owns.kind}"`;
}

function checkTerms({ contract, repoRoot, registry, tables, errors }) {
  const owners = new Map();

  for (const entry of contract.terms) {
    const where = `${CONTRACT_PATH}#${entry.term}`;
    if (typeof entry.means !== 'string' || entry.means.trim().length < 20) {
      errors.push(`${where}: carries no definition worth reading.`);
    }
    const problem = resolveOwner({ owns: entry.owns, repoRoot, registry, tables });
    if (problem !== null) {
      errors.push(`${where}: ${problem}, so the term names nothing the product runs on.`);
      continue;
    }
    const key = ownerKey(entry.owns);
    const held = owners.get(key);
    if (held !== undefined) {
      errors.push(
        `${where}: owns the same artifact as "${held}" (${key}). Two canonical words for one thing ` +
          'is the ambiguity a glossary exists to remove.',
      );
      continue;
    }
    owners.set(key, entry.term);
  }

  return owners;
}

function checkDistinctions({ contract, errors }) {
  const defined = new Set(contract.terms.map((entry) => entry.term));
  for (const distinction of contract.distinctions) {
    if (typeof distinction.why !== 'string' || distinction.why.trim().length === 0) {
      errors.push(
        `${CONTRACT_PATH}: the distinction ${distinction.words.join('/')} carries no reason.`,
      );
    }
    for (const word of distinction.words) {
      if (!defined.has(word)) {
        errors.push(
          `${CONTRACT_PATH}: the distinction ${distinction.words.join('/')} names "${word}", which the ` +
            'glossary does not define, so nothing says what it is distinct from.',
        );
      }
    }
  }
}

function topLevelSegments(repoRoot, apiRoot) {
  try {
    return readdirSync(path.join(repoRoot, apiRoot)).filter(
      (entry) =>
        !entry.startsWith('__') && statSync(path.join(repoRoot, apiRoot, entry)).isDirectory(),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function promptFiles(repoRoot, promptRoot) {
  try {
    return readdirSync(path.join(repoRoot, promptRoot))
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => `${promptRoot}/${entry}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function checkRetired({ contract, repoRoot, tables, errors, report }) {
  const { apiRoot, promptRoot } = contract.namedSurfaces;
  const segments = topLevelSegments(repoRoot, apiRoot);
  const prompts = promptFiles(repoRoot, promptRoot);
  report.segments = segments.length;
  report.tables = tables.size;
  report.prompts = prompts.length;

  for (const retired of contract.retired) {
    if (typeof retired.use !== 'string' || retired.use.length === 0) {
      errors.push(`${CONTRACT_PATH}: retired word "${retired.word}" names no replacement.`);
      continue;
    }
    const word = retired.word;

    for (const segment of segments) {
      if (segment.split('-').includes(word)) {
        errors.push(
          `${apiRoot}/${segment}: the path says "${word}". A caller reads the URL as the name of the ` +
            `thing; use "${retired.use}".`,
        );
      }
    }

    for (const table of tables.keys()) {
      if (table.split('_').includes(word)) {
        errors.push(
          `apps/web/db/neon: ${table} says "${word}" in its name; use "${retired.use}". A stored name ` +
            'outlives every rename above it.',
        );
      }
    }

    for (const prompt of prompts) {
      const source = readSource(repoRoot, prompt);
      if (source === null) continue;
      const literal = new RegExp(`['"\`][^'"\`]*\\b${word}\\b[^'"\`]*['"\`]`);
      if (literal.test(source)) {
        errors.push(
          `${prompt}: an instruction spells "${word}"; use "${retired.use}". The model answers in the ` +
            'words it was given, and the user reads them.',
        );
      }
    }
  }
}

function checkConflations({ contract, registry, errors, report }) {
  const recorded = new Map((contract.conflations ?? []).map((entry) => [entry.concept, entry]));
  const seen = new Set();

  for (const entry of contract.conflations ?? []) {
    const concept = registry.concepts.find((candidate) => candidate.name === entry.concept);
    if (concept === undefined) {
      errors.push(
        `${CONTRACT_PATH}: the conflation names concept "${entry.concept}", which no longer exists.`,
      );
      continue;
    }
    for (const field of ['why', 'fix']) {
      if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
        errors.push(`${CONTRACT_PATH}: the "${entry.concept}" conflation carries no ${field}.`);
      }
    }
    const still = entry.tables.filter((table) => concept.tables.includes(table));
    if (still.length < entry.tables.length) {
      errors.push(
        `${CONTRACT_PATH}: the "${entry.concept}" conflation is stale, it no longer owns ` +
          `${entry.tables.filter((table) => !concept.tables.includes(table)).join(', ')}. Delete it.`,
      );
    }
    seen.add(entry.concept);
    report.conflations += 1;
  }

  const named = new Map();
  for (const term of contract.terms) {
    if (term.owns.kind !== 'table') continue;
    named.set(term.owns.key, term.term);
  }
  for (const concept of registry.concepts) {
    const claimed = concept.tables.filter((table) => named.has(table));
    if (claimed.length < 2 || recorded.has(concept.name)) continue;
    errors.push(
      `${CONTRACT_PATH}: concept "${concept.name}" owns ${claimed.join(' and ')}, which the glossary ` +
        `calls ${claimed.map((table) => named.get(table)).join(' and ')}. One concept for two terms is ` +
        'the conflation the glossary forbids.',
    );
  }
}

export function checkTerminology(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const registry = loadRegistry(repoRoot);
  const tables = readTableColumns(repoRoot);
  const report = {
    terms: contract.terms.length,
    segments: 0,
    tables: 0,
    prompts: 0,
    conflations: 0,
  };

  checkTerms({ contract, repoRoot, registry, tables, errors });
  checkDistinctions({ contract, errors });
  checkRetired({ contract, repoRoot, tables, errors, report });
  checkConflations({ contract, registry, errors, report });

  return { errors, report };
}

function main() {
  const { errors, report } = checkTerminology(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Terminology check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-terminology: OK (${report.terms} terms, ${report.segments} api path segments, ` +
      `${report.tables} tables and ${report.prompts} prompt modules checked, ` +
      `${report.conflations} recorded conflation(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
