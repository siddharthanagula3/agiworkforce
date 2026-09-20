import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CLIENT_COVERAGE,
  CONTRACT_PATH,
  ERROR_STATUS_PATH,
  REFUSAL_PATH,
  REPO_ROOT,
  checkClientHandshakeCoverage,
  handlesRefusal,
  loadContract,
  refusalStatus,
} from './check-client-handshake-coverage.mjs';

const roots = [];

function fixture(edits = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-handshake-coverage-'));
  roots.push(root);
  const files = [CONTRACT_PATH, ERROR_STATUS_PATH, REFUSAL_PATH];
  for (const entry of Object.values(CLIENT_COVERAGE)) {
    if (entry.handler) files.push(entry.handler, entry.test);
  }
  for (const relative of files) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const entry of Object.values(CLIENT_COVERAGE)) {
    if (entry.owner && entry.owner !== 'apps/web')
      mkdirSync(path.join(root, entry.owner), { recursive: true });
  }
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands measures every declared client', () => {
  assert.deepEqual(checkClientHandshakeCoverage(REPO_ROOT), []);
});

test('it enumerates the clients from the contract rather than a list of its own', () => {
  const surfaces = loadContract(REPO_ROOT).clients.map((client) => client.surface);
  assert.ok(surfaces.includes('cli') && surfaces.includes('vscode'), surfaces.join(','));
  for (const surface of surfaces) {
    assert.ok(CLIENT_COVERAGE[surface] !== undefined, `${surface} is unmeasured`);
  }
  assert.equal(refusalStatus(REPO_ROOT), 426);
  assert.equal(handlesRefusal('class Foo {} // 426', 'Foo', 426), true);
  assert.equal(handlesRefusal('class Foo {}', 'Foo', 426), false);
});

test('a client that stops turning the refusal into an update message fails', () => {
  const root = fixture({
    [CLIENT_COVERAGE.vscode.handler]: (source) =>
      source.replaceAll('AgiWorkforceClientUpdateRequiredError', 'AgiWorkforceApiError'),
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) =>
      /does not turn a 426 answer into/.test(entry),
    ),
    'the missing handler should be named',
  );
});

test('a client whose test stops exercising the refusal fails', () => {
  const root = fixture({
    [CLIENT_COVERAGE.vscode.test]: (source) =>
      source.replaceAll('AgiWorkforceClientUpdateRequiredError', 'AgiWorkforceApiError'),
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) =>
      /does not exercise the 426 answer/.test(entry),
    ),
  );
});

test('a new client the contract declares and nothing measures fails', () => {
  const root = fixture({
    [CONTRACT_PATH]: (source) => {
      const contract = JSON.parse(source);
      contract.clients.push({ surface: 'watch', roots: [], sends: [], defects: [] });
      return JSON.stringify(contract, null, 2);
    },
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) =>
      /watch is a declared client with no answer/.test(entry),
    ),
  );
});

test('a client this guard measures that the contract drops fails', () => {
  const root = fixture({
    [CONTRACT_PATH]: (source) => {
      const contract = JSON.parse(source);
      contract.clients = contract.clients.filter((client) => client.surface !== 'chrome');
      return JSON.stringify(contract, null, 2);
    },
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) => /no longer declares it/.test(entry)),
  );
});

test('a server that stops refusing an out-of-date build fails', () => {
  const root = fixture({
    [REFUSAL_PATH]: (source) => source.replaceAll('clientUpdateRequired', 'validation'),
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) =>
      /no longer refuses a build below/.test(entry),
    ),
  );
});

test('a taxonomy that stops mapping the refusal to a status fails', () => {
  const root = fixture({
    [ERROR_STATUS_PATH]: (source) =>
      source.replace(/\[ErrorCode\.CLIENT_UPDATE_REQUIRED\]:\s*\d{3}/, '[ErrorCode.TIMEOUT]: 504'),
  });
  assert.ok(
    checkClientHandshakeCoverage(root).some((entry) =>
      /no longer maps CLIENT_UPDATE_REQUIRED/.test(entry),
    ),
  );
});
