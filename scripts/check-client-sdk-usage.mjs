#!/usr/bin/env node

// Six clients, one way to speak to the server. Each concern below names the one
// module that owns it, and every client either consumes that module or carries
// a recorded gap. The second half matters more: a client that writes the header
// literal itself has left the module behind whatever its imports say, so the
// guard enumerates the call sites rather than trusting the import graph.
//
// The clients are read from the handshake contract, so a surface added there is
// measured here on the same day.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/client-sdk-contract.json';
export const HANDSHAKE_CONTRACT_PATH =
  'packages/contracts/types/src/client-handshake-contract.json';

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

export function loadClients(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, HANDSHAKE_CONTRACT_PATH);
  if (source === null) return [];
  return JSON.parse(source).clients ?? [];
}

export function repositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

export function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

/** A header name written as a string where a request is being assembled. */
function writesHeaderLiteral(source, literal) {
  const escaped = literal.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`['"\`]${escaped}['"\`]\\s*:`, 'i').test(source);
}

function declaresSymbol(source, symbol) {
  return new RegExp(`export (?:const|function|type) ${symbol}\\b`).test(source);
}

function importsSymbol(source, symbol) {
  return new RegExp(`\\b${symbol}\\b`).test(source.replace(/^﻿/, ''));
}

export function collectViolations(repoRoot = REPO_ROOT, files) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const contract = loadContract(repoRoot);
  if (contract === null) {
    fail(`${CONTRACT_PATH} is missing; nothing says which module owns which concern.`);
    return violations;
  }

  const clients = loadClients(repoRoot);
  if (clients.length === 0) {
    fail(`${HANDSHAKE_CONTRACT_PATH} lists no clients; there is nothing to hold to the contract.`);
    return violations;
  }

  const sources = (files ?? repositoryFiles(repoRoot)).filter(
    (file) => /\.tsx?$/.test(file) && !isNonProductionPath(file),
  );

  for (const [concern, rule] of Object.entries(contract.concerns ?? {})) {
    const where = `${CONTRACT_PATH}: concern "${concern}"`;

    const ownerSource = read(repoRoot, rule.owner.module);
    if (ownerSource === null) {
      fail(`${where} is owned by ${rule.owner.module}, which does not exist.`);
      continue;
    }
    if (!declaresSymbol(ownerSource, rule.owner.symbol)) {
      fail(`${rule.owner.module} no longer declares ${rule.owner.symbol}, which owns ${concern}.`);
      continue;
    }

    for (const client of clients) {
      const entry = rule.clients?.[client.surface];
      const at = `${where} on ${client.surface}`;
      if (entry === undefined) {
        fail(`${at}: nothing says whether this client uses the shared module or why it cannot.`);
        continue;
      }
      if (entry.consumes !== undefined && entry.gap !== undefined) {
        fail(`${at}: recorded both as consuming the module and as a gap.`);
        continue;
      }
      if (entry.consumes !== undefined) {
        const consumer = read(repoRoot, entry.consumes);
        const symbol = entry.symbol ?? rule.owner.symbol;
        if (consumer === null) {
          fail(`${at}: ${entry.consumes} does not exist, so nothing consumes ${concern}.`);
        } else if (!importsSymbol(consumer, symbol)) {
          fail(`${at}: ${entry.consumes} no longer names ${symbol}.`);
        } else if (!consumer.includes(rule.owner.package ?? rule.owner.module)) {
          fail(
            `${at}: ${entry.consumes} names ${symbol} without importing it from ` +
              `${rule.owner.package ?? rule.owner.module}, so it is a local copy of the same idea.`,
          );
        }
        continue;
      }
      if (typeof entry.gap !== 'string' || entry.gap.trim().length === 0) {
        fail(`${at}: recorded as a gap with no reason.`);
      }
    }

    const literals = rule.headerLiterals ?? [];
    if (literals.length === 0) continue;

    const permitted = new Set([rule.owner.module, ...(rule.permittedCallSites ?? [])]);
    const offenders = [];
    for (const file of sources) {
      if (permitted.has(file)) continue;
      if (!(rule.roots ?? []).some((root) => file.startsWith(root))) continue;
      const source = read(repoRoot, file);
      if (source === null) continue;
      for (const literal of literals) {
        if (!writesHeaderLiteral(source, literal)) continue;
        if (importsSymbol(source, rule.owner.symbol)) continue;
        offenders.push(`${file} writes "${literal}"`);
      }
    }

    for (const offender of offenders) {
      fail(
        `${offender} instead of importing ${rule.owner.symbol} from ${rule.owner.module}. ` +
          `One module owns ${concern}; a call site that spells it itself drifts from every other.`,
      );
    }

    for (const site of rule.permittedCallSites ?? []) {
      const source = read(repoRoot, site);
      if (source === null) {
        fail(`${where} permits ${site}, which does not exist. Delete the entry.`);
        continue;
      }
      if (!literals.some((literal) => writesHeaderLiteral(source, literal))) {
        fail(
          `${where} permits ${site} to spell the header itself, and it no longer does. Delete the ` +
            'entry so the list cannot become an allowlist.',
        );
        continue;
      }
      if (importsSymbol(source, rule.owner.symbol)) {
        fail(
          `${where} permits ${site}, which already goes through ${rule.owner.symbol} and would ` +
            'never have been flagged. An entry that excuses nothing hides the ones that do.',
        );
      }
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('Shared client SDK violations:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log('Shared client SDK: one module per concern, and every client goes through it.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
