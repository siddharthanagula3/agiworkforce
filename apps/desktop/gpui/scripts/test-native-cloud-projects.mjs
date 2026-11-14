import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import console from 'node:console';
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
assert.equal(process.argv.length, 2, 'This runner requires a fresh isolated fixture');
const fixture = createNativeCloudFixture();
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-native-projects-'));
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
    AGI_GPUI_PROJECTS_FIXTURE: '1',
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
      '--test',
      'projects_runtime',
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
  assert.equal(after.requests.length - before.requests.length, 1);
  assert.equal(
    Object.entries(after.counts)
      .filter(
        ([route]) =>
          route.startsWith('GET ') &&
          route.includes('/knowledge-files/') &&
          route.endsWith('/text'),
      )
      .reduce((total, [, count]) => total + count, 0),
    4,
    'Preview refusal or checksum recovery fetched an unsupported source or replayed extraction',
  );
  assert(!Object.keys(after.counts).some((route) => route.includes('/not-a-native-download-url')));

  assert.equal(
    after.counts.projectWrites,
    7,
    'Rejected requests or response recovery replayed a project mutation',
  );
  assert.equal(
    after.projects.filter((project) => project.name === 'Fixture lost project creation').length,
    1,
    'A lost creation response created more than one project',
  );
  console.log(
    'Packaged native project permissions, versioned edits, scoped conversations and cold recovery passed',
  );
} finally {
  await fixture.close();
  fs.rmSync(state.config, { recursive: true, force: true });
}
