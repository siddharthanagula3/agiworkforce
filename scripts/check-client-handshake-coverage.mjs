#!/usr/bin/env node

// Sending the contract version is half the handshake. This enumerates the
// clients the contract declares and fails on one that cannot act on the
// server's "your build is too old" answer, or on a declared gap that has closed.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/client-handshake-contract.json';
export const ERROR_STATUS_PATH = 'packages/contracts/types/src/errors.ts';
export const REFUSAL_PATH = 'apps/web/lib/api-gateway-policy.ts';

/**
 * How each client is expected to recognise the refusal. A surface with no
 * entry fails rather than passing unmeasured, and a gap that is fixed fails
 * too, so the list cannot rot into an allowlist.
 */
export const CLIENT_COVERAGE = {
  vscode: {
    handler: 'apps/extension-vscode/src/utils/api.ts',
    test: 'apps/extension-vscode/src/__tests__/api.test.ts',
    symbol: 'AgiWorkforceClientUpdateRequiredError',
  },
  cli: {
    gap: 'apps/cli/src/cloud/handshake.rs sends the contract version and nothing on the CLI reads a 426 answer. The refusal is parsed as a generic HTTP failure, so the user is told the request failed rather than to update.',
    owner: 'apps/cli',
  },
  web: {
    gap: 'apps/web is the deployment that raises the refusal, so its own bundle can never receive one: the UI and the API ship as one artifact.',
    owner: 'apps/web',
  },
  desktop: {
    gap: 'The desktop shell wraps the web bundle, so it inherits whatever the web bundle does with a 426 and has no fetch layer of its own to teach.',
    owner: 'apps/desktop',
  },
  mobile: {
    gap: 'apps/mobile/services/api.ts maps plan gates and auth failures only; a 426 falls through to the generic request-failed path.',
    owner: 'apps/mobile',
  },
  chrome: {
    gap: 'apps/extension sends the handshake through platformHeaders.ts and reads no version answer back.',
    owner: 'apps/extension',
  },
};

function read(repoRoot, relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(read(repoRoot, CONTRACT_PATH));
}

export function refusalStatus(repoRoot = REPO_ROOT) {
  const match = /\[ErrorCode\.CLIENT_UPDATE_REQUIRED\]:\s*(\d{3})/.exec(
    read(repoRoot, ERROR_STATUS_PATH),
  );
  return match === null ? null : Number(match[1]);
}

export function handlesRefusal(source, symbol, status) {
  return source.includes(symbol) && new RegExp(`\\b${status}\\b`).test(source);
}

export function checkClientHandshakeCoverage(repoRoot = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const status = refusalStatus(repoRoot);
  if (status === null) {
    fail(`${ERROR_STATUS_PATH} no longer maps CLIENT_UPDATE_REQUIRED to a status`);
    return failures;
  }
  if (!read(repoRoot, REFUSAL_PATH).includes('clientUpdateRequired')) {
    fail(`${REFUSAL_PATH} no longer refuses a build below the minimum contract version`);
  }

  const contract = loadContract(repoRoot);
  const surfaces = contract.clients.map((client) => client.surface);
  if (surfaces.length === 0) fail(`${CONTRACT_PATH} declares no clients`);

  for (const surface of surfaces) {
    const coverage = CLIENT_COVERAGE[surface];
    if (coverage === undefined) {
      fail(`${surface} is a declared client with no answer to the upgrade-required refusal`);
      continue;
    }
    if (coverage.gap !== undefined) {
      if (coverage.gap.trim().length < 40 || !coverage.owner) {
        fail(`${surface} is recorded as a gap without a reason and an owner`);
      }
      continue;
    }
    for (const key of ['handler', 'test']) {
      if (!existsSync(path.join(repoRoot, coverage[key]))) {
        fail(`${surface} names ${coverage[key]}, which is not in the tree`);
      }
    }
    if (!existsSync(path.join(repoRoot, coverage.handler))) continue;
    if (!handlesRefusal(read(repoRoot, coverage.handler), coverage.symbol, status)) {
      fail(
        `${coverage.handler} does not turn a ${status} answer into ${coverage.symbol}, so ${surface} cannot tell the user to update`,
      );
    }
    if (existsSync(path.join(repoRoot, coverage.test))) {
      const test = read(repoRoot, coverage.test);
      if (!handlesRefusal(test, coverage.symbol, status)) {
        fail(`${coverage.test} does not exercise the ${status} answer for ${surface}`);
      }
    }
  }

  for (const [surface, coverage] of Object.entries(CLIENT_COVERAGE)) {
    if (!surfaces.includes(surface)) {
      fail(`${surface} is covered here but ${CONTRACT_PATH} no longer declares it`);
    }
    if (coverage.gap === undefined || coverage.owner === 'apps/web') continue;
    if (!existsSync(path.join(repoRoot, coverage.owner))) {
      fail(`${surface} names ${coverage.owner} as its owner, which is not in the tree`);
    }
  }

  return failures;
}

function main() {
  const failures = checkClientHandshakeCoverage();
  if (failures.length > 0) {
    console.error('Client handshake coverage check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const gaps = Object.entries(CLIENT_COVERAGE).filter(([, entry]) => entry.gap !== undefined);
  console.log(
    `check-client-handshake-coverage: every declared client is measured, ${gaps.length} recorded gap(s).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
