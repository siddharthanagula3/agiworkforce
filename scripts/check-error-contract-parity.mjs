#!/usr/bin/env node

// One failure, one code, the same answer on every surface. The closed set is
// generated from the Rust protocol, so the members are enumerated from the
// binding rather than listed here, and every client that branches on a failure
// is held to that set: a client that names a code the protocol dropped is
// branching on something the server can no longer send, and a client that has
// no answer for a member the protocol does send falls back to a sentence
// written for a different surface.
//
// Byte-identity between the generated bindings and their Rust mirror is
// check:protocol-parity's job; this guard is about what the clients do with
// them.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/error-contract-parity.json';
export const TAXONOMY_PATH = 'packages/contracts/types/src/error-taxonomy.json';
export const GENERATED_ROOT = 'packages/contracts/types/src/generated/protocol';

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function loadContract(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, CONTRACT_PATH);
  return source === null ? null : JSON.parse(source);
}

/** The members of a generated string-union binding, in the order Rust declares them. */
export function readGeneratedUnion(repoRoot, typeName) {
  const source = read(repoRoot, `${GENERATED_ROOT}/${typeName}.ts`);
  if (source === null) return null;
  const declaration = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source);
  if (declaration === null) return null;
  return [...declaration[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

/** The code names a consumer branches on, taken from the region it declares them in. */
export function readConsumerCodes(source, region) {
  const block = new RegExp(region).exec(source);
  if (block === null) return null;
  return [
    ...new Set([
      ...[...block[0].matchAll(/^\s+([a-z][a-z_]+):/gm)].map((match) => match[1]),
      ...[...block[0].matchAll(/===\s*'([a-z_]+)'/g)].map((match) => match[1]),
      ...[...block[0].matchAll(/case\s*'([a-z_]+)'/g)].map((match) => match[1]),
    ]),
  ];
}

export function collectViolations(repoRoot = REPO_ROOT) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const contract = loadContract(repoRoot);
  if (contract === null) {
    fail(`${CONTRACT_PATH} is missing; no client is held to the protocol's failure codes.`);
    return violations;
  }

  for (const [typeName, rule] of Object.entries(contract.vocabularies ?? {})) {
    const members = readGeneratedUnion(repoRoot, typeName);
    if (members === null || members.length === 0) {
      fail(
        `${GENERATED_ROOT}/${typeName}.ts no longer parses as a closed set, so every consumer ` +
          'below is unchecked.',
      );
      continue;
    }

    for (const consumer of rule.consumers ?? []) {
      const source = read(repoRoot, consumer.file);
      const where = `${consumer.file} (${consumer.surface})`;
      if (source === null) {
        fail(`${CONTRACT_PATH}: ${where} does not exist, so nothing maps ${typeName} there.`);
        continue;
      }

      const named = readConsumerCodes(source, consumer.region);
      if (named === null || named.length === 0) {
        fail(`${where}: the ${typeName} table no longer parses; its shape changed.`);
        continue;
      }

      for (const code of named) {
        if (!members.includes(code)) {
          fail(
            `${where} branches on "${code}", which ${typeName} does not declare. The server ` +
              'cannot send it, so that branch is unreachable.',
          );
        }
      }

      const excused = new Map(Object.entries(consumer.uncovered ?? {}));
      for (const member of members) {
        if (named.includes(member)) {
          if (excused.has(member)) {
            fail(
              `${CONTRACT_PATH}: ${where} excuses "${member}" and now handles it. Delete the entry ` +
                'so the list cannot become an allowlist.',
            );
          }
          continue;
        }
        const reason = excused.get(member);
        if (reason === undefined) {
          fail(
            `${where} has no answer for "${member}", so the reader gets the fallback sentence ` +
              'instead of one written for this surface.',
          );
        } else if (typeof reason !== 'string' || reason.trim().length === 0) {
          fail(`${CONTRACT_PATH}: ${where} excuses "${member}" without saying why.`);
        }
      }
    }
  }

  const taxonomySource = read(repoRoot, TAXONOMY_PATH);
  if (taxonomySource === null) {
    fail(`${TAXONOMY_PATH} is missing; nothing says whether a code may be retried.`);
    return violations;
  }
  const taxonomy = JSON.parse(taxonomySource);

  const seen = new Map();
  for (const [className, rule] of Object.entries(taxonomy.classes ?? {})) {
    if (typeof rule.retryable !== 'boolean') {
      fail(`${TAXONOMY_PATH}: class "${className}" does not say whether it may be retried.`);
    }
    for (const code of rule.codes ?? []) {
      const previous = seen.get(code);
      if (previous !== undefined) {
        fail(
          `${TAXONOMY_PATH}: "${code}" is in both "${previous}" and "${className}", so its ` +
            'retryability depends on which class a reader happens to look at first.',
        );
        continue;
      }
      seen.set(code, className);
    }
  }

  for (const [code, expected] of Object.entries(contract.retryability ?? {})) {
    const className = seen.get(code);
    if (className === undefined) {
      fail(`${CONTRACT_PATH}: "${code}" is pinned here and ${TAXONOMY_PATH} does not classify it.`);
      continue;
    }
    const actual = taxonomy.classes[className].retryable;
    if (actual !== expected) {
      fail(
        `${TAXONOMY_PATH}: "${code}" is now ${actual ? 'retryable' : 'fatal'} and every client was ` +
          `built against ${expected ? 'retryable' : 'fatal'}. Changing it silently changes six ` +
          'surfaces at once.',
      );
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('Error contract parity violations:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log('Error contract parity: every client branches on the codes the protocol declares.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
