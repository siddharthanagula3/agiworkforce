import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DOMAIN_SOURCE,
  SHELL_DIR,
  checkDesktopTelemetryDomains,
  declaredDomains,
  emittedDomains,
} from './check-desktop-telemetry-domains.mjs';

const roots = [];

const VOCABULARY = `
export const DESKTOP_TELEMETRY_DOMAINS = [
  'launch',
  'updater',
] as const;
`;

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-telemetry-domains-'));
  roots.push(root);
  const all = { [path.relative(SHELL_DIR, DOMAIN_SOURCE)]: VOCABULARY, ...files };
  for (const [name, source] of Object.entries(all)) {
    const destination = path.join(root, SHELL_DIR, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, source, 'utf8');
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository as it stands passes', () => {
  assert.deepEqual(checkDesktopTelemetryDomains(), []);
});

test('reads the vocabulary out of the array rather than a list of its own', () => {
  assert.deepEqual(declaredDomains(VOCABULARY), ['launch', 'updater']);
  assert.deepEqual(declaredDomains('export const SOMETHING_ELSE = [];'), []);
});

test('reads a call spread over several lines whole', () => {
  const calls = emittedDomains(`
    recordDesktopEvent({
      domain: 'updater',
      outcome: 'failed',
      cause: 'network',
    });
  `);
  assert.deepEqual(
    calls.map((call) => call.domain),
    ['updater'],
  );
});

test('a domain nothing emits fails', () => {
  const root = fixture({
    'main.ts': "recordDesktopEvent({ domain: 'launch', outcome: 'ok' });",
  });
  const failures = checkDesktopTelemetryDomains(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /nothing in .* reports on "updater"/);
});

test('a domain proved only by its own test is not instrumented', () => {
  const root = fixture({
    'main.ts': "recordDesktopEvent({ domain: 'launch', outcome: 'ok' });",
    '__tests__/updater.test.ts': "recordDesktopEvent({ domain: 'updater', outcome: 'ok' });",
  });
  assert.match(checkDesktopTelemetryDomains(root)[0], /reports on "updater"/);
});

test('a call naming a domain the vocabulary does not hold fails', () => {
  const root = fixture({
    'main.ts': `
      recordDesktopEvent({ domain: 'launch', outcome: 'ok' });
      recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
      recordDesktopEvent({ domain: 'invented', outcome: 'ok' });
    `,
  });
  const failures = checkDesktopTelemetryDomains(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /reports on "invented", which DESKTOP_TELEMETRY_DOMAINS does not name/);
});

test('a call built from a variable rather than a literal fails', () => {
  const root = fixture({
    'main.ts': `
      recordDesktopEvent({ domain: whicheverDomain, outcome: 'ok' });
      recordDesktopEvent({ domain: 'launch', outcome: 'ok' });
      recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
    `,
  });
  const failures = checkDesktopTelemetryDomains(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /called without a literal domain/);
});

test('a vocabulary that lost its array fails rather than passing empty', () => {
  const root = fixture({ 'main.ts': '' });
  writeFileSync(path.join(root, DOMAIN_SOURCE), 'export const DESKTOP_TELEMETRY_DOMAINS = [];');
  assert.match(checkDesktopTelemetryDomains(root)[0], /names no domain/);
});

test('a missing vocabulary file fails rather than passing empty', () => {
  const root = fixture({ 'main.ts': '' });
  rmSync(path.join(root, DOMAIN_SOURCE));
  assert.match(checkDesktopTelemetryDomains(root)[0], /could not be read/);
});
