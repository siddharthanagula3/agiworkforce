#!/usr/bin/env node

/**
 * Nothing that outlives its build depends on the build's own version number.
 * Every artifact in the registry names the file that carries its version, and
 * this guard resolves each one, so a renamed or deleted constant fails here
 * rather than in a client that silently reads a shape it does not know.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY_PATH = 'packages/contracts/types/src/version-registry.json';
export const REGISTRY_MODULE = 'packages/contracts/types/src/version-registry.ts';

/** Artifacts two builds exchange at run time; each needs a floor a reader can refuse below. */
export const NEGOTIATED_NEEDS_FLOOR = true;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function readVocabulary(source, symbol) {
  const match = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (match === null) return null;
  const members = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  return members.length === 0 ? null : members;
}

function declaresConstant(source, symbol) {
  return new RegExp(`export const ${symbol}\\b`).test(source);
}

function namesSymbol(source, symbol) {
  return new RegExp(`\\b${symbol}\\b`).test(source);
}

function highestMigration(repoRoot, relativeDir) {
  let entries;
  try {
    entries = readdirSync(path.join(repoRoot, relativeDir));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const numbers = entries
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .map((entry) => Number.parseInt(entry.slice(0, 4), 10));
  return numbers.length === 0 ? null : Math.max(...numbers);
}

export function resolveEntry({ repoRoot, name, entry }) {
  const errors = [];
  if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
    errors.push(`${REGISTRY_PATH}: "${name}" does not say why it is versioned on its own.`);
  }

  if (entry.kind === 'migrationSequence') {
    if (highestMigration(repoRoot, entry.path) === null) {
      errors.push(
        `${REGISTRY_PATH}: "${name}" points at ${entry.path}, which holds no numbered migration.`,
      );
    }
    return errors;
  }

  const source = read(repoRoot, entry.file);
  if (source === null) {
    errors.push(`${REGISTRY_PATH}: "${name}" points at ${entry.file}, which does not exist.`);
    return errors;
  }

  if (entry.kind === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch {
      errors.push(
        `${REGISTRY_PATH}: "${name}" points at ${entry.file}, which is not readable JSON.`,
      );
      return errors;
    }
    if (parsed?.[entry.field] === undefined) {
      errors.push(
        `${REGISTRY_PATH}: "${name}" reads ${entry.file}.${entry.field}, which the file no longer carries.`,
      );
    }
    return errors;
  }

  const found =
    entry.kind === 'referenced'
      ? namesSymbol(source, entry.symbol)
      : declaresConstant(source, entry.symbol);
  if (!found) {
    errors.push(
      `${REGISTRY_PATH}: "${name}" names ${entry.symbol} in ${entry.file}, which no longer carries it. ` +
        'Point it at the constant that replaced it; an artifact whose version nothing carries is ' +
        'versioned by the app build, which says nothing about its shape.',
    );
  }
  if (entry.minSymbol !== undefined && !declaresConstant(source, entry.minSymbol)) {
    errors.push(
      `${REGISTRY_PATH}: "${name}" names a floor ${entry.minSymbol} that ${entry.file} does not declare.`,
    );
  }
  if (/package\.json$/.test(entry.file)) {
    errors.push(
      `${REGISTRY_PATH}: "${name}" takes its version from a package manifest, which changes when the ` +
        'build changes and not when the shape does.',
    );
  }
  return errors;
}

export function checkVersionRegistry(repoRoot = REPO_ROOT) {
  const raw = read(repoRoot, REGISTRY_PATH);
  if (raw === null) return { errors: [`${REGISTRY_PATH} does not exist.`], report: null };
  const registry = JSON.parse(raw);
  const moduleSource = read(repoRoot, REGISTRY_MODULE);
  const declared =
    moduleSource === null ? null : readVocabulary(moduleSource, 'VERSIONED_ARTIFACTS');
  const errors = [];

  if (declared === null) {
    errors.push(`${REGISTRY_MODULE}: no longer exports VERSIONED_ARTIFACTS.`);
  }

  const entries = registry.artifacts ?? {};
  for (const name of declared ?? []) {
    if (entries[name] === undefined) {
      errors.push(`${REGISTRY_PATH}: "${name}" is declared in the type and names no carrier.`);
    }
  }
  for (const [name, entry] of Object.entries(entries)) {
    if (declared !== null && !declared.includes(name)) {
      errors.push(
        `${REGISTRY_MODULE}: VERSIONED_ARTIFACTS omits "${name}", so nothing can name it in code.`,
      );
    }
    errors.push(...resolveEntry({ repoRoot, name, entry }));
    if (NEGOTIATED_NEEDS_FLOOR && entry.negotiated === true && entry.kind === 'constant') {
      const source = read(repoRoot, entry.file);
      const hasFloor =
        entry.minSymbol !== undefined ||
        (source !== null && /MIN[_A-Z]*VERSION|SUPPORTED[_A-Z]*VERSIONS/.test(source));
      if (!hasFloor) {
        errors.push(
          `${REGISTRY_PATH}: "${name}" is exchanged at run time and declares no floor, so an old ` +
            'client meeting a newer server cannot tell that it is out of date.',
        );
      }
    }
  }

  const floor = registry.clientFloor;
  if (floor === undefined) {
    errors.push(
      `${REGISTRY_PATH}: no client floor, so the server cannot refuse a dangerously old client.`,
    );
  } else {
    const source = read(repoRoot, floor.file);
    if (source === null) {
      errors.push(
        `${REGISTRY_PATH}: the client floor points at ${floor.file}, which does not exist.`,
      );
    } else {
      for (const symbol of [floor.symbol, floor.unsupportedCode]) {
        if (!declaresConstant(source, symbol)) {
          errors.push(
            `${REGISTRY_PATH}: the client floor names ${symbol}, which ${floor.file} no longer declares.`,
          );
        }
      }
    }
  }

  return {
    errors,
    report: {
      artifacts: Object.keys(entries).length,
      negotiated: Object.values(entries).filter((entry) => entry.negotiated === true).length,
    },
  };
}

function main() {
  const { errors, report } = checkVersionRegistry(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Version registry check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-version-registry: OK (${report.artifacts} independently versioned artifacts, ` +
      `${report.negotiated} negotiated at run time)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
