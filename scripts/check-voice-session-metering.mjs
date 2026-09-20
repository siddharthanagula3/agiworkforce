#!/usr/bin/env node

// The monthly voice allowance is a SQL sum over the usage JSON of settled
// managed-usage requests. It counts particular operations and reads one field
// per operation, so a route that settles a finished session without writing
// that field has its minutes counted as zero, and one that writes it on a
// refused session charges the allowance for work that never ran.
//
// Both halves are enumerated here from the quota query itself rather than from
// a list kept beside it: the operations it counts, the field it sums for each,
// and then every settlement in the app that names one of those operations.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const QUOTA_PATH = 'apps/web/lib/services/tier-unit-quota-service.ts';
export const APP_DIR = 'apps/web/app/api';
const METERED_UNIT = 'voice_minutes';

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function walk(root, dir, out) {
  let entries;
  try {
    entries = readdirSync(path.join(root, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relative = `${dir}/${entry}`;
    if (statSync(path.join(root, relative)).isDirectory()) walk(root, relative, out);
    else if (entry.endsWith('.ts') && !entry.includes('.test.')) out.push(relative);
  }
  return out;
}

/**
 * The operations the voice allowance counts and the usage field it sums for
 * each, taken from the quota query's own CASE arms.
 */
export function readMeteredOperations(source) {
  const block = new RegExp(`${METERED_UNIT}:\\s*\\{([\\s\\S]*?)\\n  \\},`).exec(source);
  if (!block) return null;
  const arms = [
    ...block[1].matchAll(
      /when\s+usage->>'operation'\s*=\s*'\$\{([A-Z_]+)\}'[\s\S]*?usage->>'([A-Za-z]+)'/g,
    ),
  ];
  const operations = [];
  for (const arm of arms) {
    const constant = new RegExp(`const ${arm[1]}\\s*=\\s*'([a-z_]+)'`).exec(source);
    if (!constant) continue;
    operations.push({ operation: constant[1], field: arm[2] });
  }
  return operations.length > 0 ? operations : null;
}

/** Every finalize call in the app, with the outcome it settles and its usage body. */
export function readSettlements(source) {
  const settlements = [];
  for (const match of source.matchAll(/finalizeManagedUsageRequest\(\{/g)) {
    const open = source.indexOf('{', match.index ?? 0);
    let depth = 0;
    let body = null;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          body = source.slice(open, index + 1);
          break;
        }
      }
    }
    if (body === null) continue;
    const outcome = /outcome:\s*'([a-z_]+)'/.exec(body);
    const usageStart = body.indexOf('usage:');
    settlements.push({
      outcome: outcome ? outcome[1] : null,
      usage: usageStart === -1 ? '' : body.slice(usageStart),
    });
  }
  return settlements;
}

export function checkVoiceSessionMetering(repoRoot = REPO_ROOT) {
  const failures = [];
  const quota = read(repoRoot, QUOTA_PATH);
  if (quota === null) {
    failures.push(`${QUOTA_PATH} is missing; nothing bounds the monthly voice allowance`);
    return failures;
  }

  const metered = readMeteredOperations(quota);
  if (metered === null) {
    failures.push(`${QUOTA_PATH} no longer says which usage fields the voice allowance sums`);
    return failures;
  }

  const files = walk(repoRoot, APP_DIR, []);
  const seen = new Map(metered.map((entry) => [entry.operation, 0]));
  for (const relative of files) {
    const source = read(repoRoot, relative);
    if (source === null || !source.includes('finalizeManagedUsageRequest')) continue;
    for (const settlement of readSettlements(source)) {
      for (const { operation, field } of metered) {
        if (!new RegExp(`operation:\\s*'${operation}'`).test(settlement.usage)) continue;
        seen.set(operation, (seen.get(operation) ?? 0) + 1);
        const carriesField = new RegExp(`\\b${field}\\b`).test(settlement.usage);
        if (settlement.outcome === 'completed' && !carriesField) {
          failures.push(
            `${relative} settles a completed ${operation} without ${field}, so the allowance counts it as nothing`,
          );
        }
        if (settlement.outcome === 'failed' && carriesField) {
          failures.push(
            `${relative} writes ${field} on a released ${operation}, so a refused session spends the allowance`,
          );
        }
      }
    }
  }

  for (const [operation, count] of seen) {
    if (count === 0) {
      failures.push(`nothing under ${APP_DIR} settles ${operation}, which the allowance counts`);
    }
  }

  return failures;
}

function main() {
  const failures = checkVoiceSessionMetering();
  if (failures.length > 0) {
    console.error('Voice session metering failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('Voice metering: every settled session writes the field the allowance sums.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
