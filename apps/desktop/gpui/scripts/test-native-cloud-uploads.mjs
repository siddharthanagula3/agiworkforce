import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { RESUMABLE_UPLOAD_PART_BYTES } from '@agiworkforce/cloud-contracts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { createNativeCloudFixture } from './native-cloud-fixture.mjs';

assert.equal(
  process.platform,
  'darwin',
  'This runner currently requires the macOS development bundle',
);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev', `${PRODUCT_NAMES.desktop}.app`);
const manifest = JSON.parse(
  fs.readFileSync(path.join(bundle, 'Contents/Resources/native-runtime.json'), 'utf8'),
);
assert(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--recovery'),
  'This runner requires a fresh isolated fixture',
);
const recoveryOnly = process.argv[2] === '--recovery';
const fixture = createNativeCloudFixture();
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-native-uploads-'));
const state = { origin: await fixture.listen(), jwt: fixture.jwt, config: artifacts };

try {
  const origin = new URL(state.origin);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  assert(state.jwt.startsWith('fixture.'));
  const environment = Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(environment, {
    AGIWORKFORCE_HOME: state.config,
    AGIWORKFORCE_API_BASE: state.origin,
    AGI_AUTH_BASE: `${state.origin}/api`,
    AGIWORKFORCE_JWT: state.jwt,
    AGI_GPUI_UPLOADS_FIXTURE: '1',
    AGI_GPUI_TEST_RUNTIME: path.join(bundle, 'Contents/MacOS', manifest.executable),
  });
  const beforeResponse = await globalThis.fetch(`${state.origin}/fixture/state`, {
    headers: { Authorization: `Bearer ${state.jwt}` },
  });
  assert.equal(beforeResponse.status, 200);
  const before = await beforeResponse.json();
  const child = spawn(
    'cargo',
    [
      'test',
      '-p',
      'agiworkforce-desktop-gpui',
      '--no-default-features',
      '--features',
      'cloud-fixture-test',
      ...(recoveryOnly
        ? ['--test', 'attachment_recovery_runtime']
        : ['--test', 'uploads_runtime', '--test', 'chat_uploads_runtime']),
      '--',
      '--ignored',
    ],
    { cwd: root, env: environment, stdio: 'inherit' },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0);
  const after = await (
    await globalThis.fetch(`${state.origin}/fixture/state`, {
      headers: { Authorization: `Bearer ${state.jwt}` },
    })
  ).json();
  assert.deepEqual(after.failures, []);
  if (recoveryOnly) {
    assert.equal(after.counts.chatUploadCreates, 4);
    assert.equal(after.counts.chatUploadCompletedFiles, 4);
    assert.equal(after.requests.length, 2);
    assert.equal(after.counts.gatewayCalls, 2);
  } else {
    assert.equal(
      after.requests.length,
      before.requests.length + 3,
      'The chat attachment sends and follow-up must be the only gateway requests',
    );
    assert.equal(
      after.counts.gatewayCalls ?? 0,
      (before.counts.gatewayCalls ?? 0) + 3,
      'Only the three explicit chat sends may reach the gateway',
    );
    assert.equal(after.counts.uploadCompletedFiles, 4);
    assert.equal(after.counts.uploadCompletionCalls, 6);
    assert.equal(
      after.counts.uploadCreates,
      9,
      'A rejected or recovered upload replayed session creation',
    );
    assert.equal(after.counts.uploadPartWrites, 10, 'Recovery replayed an already stored part');
    assert.equal(after.counts.uploadAborts, 4);
    const reviewed = after.uploads.find(
      (upload) =>
        upload.input.kind === 'chat-attachment' && upload.input.fileName === 'reviewed 東京.txt',
    );
    assert(reviewed);
    assert.equal(
      reviewed.input.checksumSha256,
      createHash('sha256')
        .update('x'.repeat(RESUMABLE_UPLOAD_PART_BYTES + 17))
        .digest('hex'),
    );
    assert.equal(after.counts.chatUploadCreates, 5);
    assert.equal(after.counts.chatUploadPartWrites, 5);
    assert.equal(after.counts.chatUploadCompletionCalls, 5);
    assert.equal(after.counts.chatUploadCompletedFiles, 3);
    assert.equal(after.counts.chatUploadAborts, 1);
  }
  assert(after.uploads.every((upload) => !Object.hasOwn(upload, 'session')));
  console.log(
    'Packaged native selected-file snapshots, multipart recovery, cancellation and publication checks passed',
  );
} finally {
  await fixture.close();
  fs.rmSync(state.config, { recursive: true, force: true });
}
