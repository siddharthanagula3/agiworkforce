import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { declaredChannels, scannerChannels, wiredChannels } from './lib/outbound-inspection.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-outbound-inspection-coverage.mjs',
);

const MODULE = `
export type OutboundChannel = 'connector_write' | 'share' | 'artifact_publish' | 'upload';
export const secretPatternScanner = {
  id: 'secret_patterns',
  channels: ['connector_write', 'share', 'artifact_publish'],
};
export async function inspectOutboundContent(input) {
  let policy;
  try {
    policy = await input.resolveMode();
  } catch {
    policy = { mode: 'block', organizationId: input.organizationId };
  }
  await recordAuditEvent({ eventType: 'dlp_content_blocked' });
  return policy;
}
`;

const CALL_SITE = (channel) => `
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
export async function POST(request) {
  const verdict = await inspectOutboundContent({
    channel: '${channel}',
    value: await request.json(),
    userId: 'u',
    organizationId: null,
    resolveMode: async () => ({ mode: 'block', organizationId: null }),
  });
  return verdict;
}
`;

function fixture(callSites, moduleSource = MODULE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-'));
  const write = (relative, source) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  };
  write('apps/web/lib/security/outbound-content-inspection.ts', moduleSource);
  for (const [relative, source] of Object.entries(callSites)) write(relative, source);
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const ALL_WIRED = {
  'apps/web/app/api/connectors/route.ts': CALL_SITE('connector_write'),
  'apps/web/app/api/share/route.ts': CALL_SITE('share'),
  'apps/web/app/api/uploads/route.ts': CALL_SITE('upload'),
};

test('passes when every channel but the one it owes is inspected', () => {
  const result = run(fixture(ALL_WIRED));
  assert.equal(result.code, 0);
  assert.match(result.output, /4 outbound channels, 3 inspected at 3 call sites, 1 owed/);
});

test('fails when a channel loses its only call site', () => {
  const { 'apps/web/app/api/share/route.ts': _dropped, ...rest } = ALL_WIRED;
  const result = run(fixture(rest));
  assert.equal(result.code, 1);
  assert.match(result.output, /the channel 'share' is declared but nothing calls/);
});

test('fails when a scanner claims a channel the vocabulary does not have', () => {
  const result = run(
    fixture(ALL_WIRED, MODULE.replace("'artifact_publish']", "'artifact_publish', 'email']")),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /declares the channel 'email', which OutboundChannel does not/);
});

test('fails when the inspection stops reading the workspace policy', () => {
  const result = run(fixture(ALL_WIRED, MODULE.replace('input.resolveMode()', 'defaultMode()')));
  assert.equal(result.code, 1);
  assert.match(result.output, /no longer reads the workspace policy/);
});

test('fails when the inspection stops recording what it blocked', () => {
  const result = run(fixture(ALL_WIRED, MODULE.replace('recordAuditEvent', 'noteSomewhere')));
  assert.equal(result.code, 1);
  assert.match(result.output, /no longer records what it blocked or redacted/);
});

test('fails when the owed channel is wired but its baseline entry stays', () => {
  const result = run(
    fixture({
      ...ALL_WIRED,
      'apps/web/app/api/artifacts/publish/route.ts': CALL_SITE('artifact_publish'),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /is wired now; remove its baseline entry/);
});

test('fails when the module is gone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-empty-'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /is missing; nothing inspects/);
});

test('reads the vocabulary and the call sites out of the source', () => {
  assert.deepEqual(declaredChannels(MODULE), [
    'connector_write',
    'share',
    'artifact_publish',
    'upload',
  ]);
  assert.deepEqual([...scannerChannels(MODULE)].sort(), [
    'artifact_publish',
    'connector_write',
    'share',
  ]);
  assert.deepEqual([...wiredChannels(CALL_SITE('upload'))], ['upload']);
});
