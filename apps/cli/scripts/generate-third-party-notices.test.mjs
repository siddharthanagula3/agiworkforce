import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  CLI_PACKAGE,
  OUTPUT_FILE,
  RELEASE_WORKFLOW,
  featuresForTarget,
  releaseTargets,
} from './generate-third-party-notices.mjs';

test('takes the build targets from the release workflow matrix', () => {
  const targets = releaseTargets(
    [
      '        include:',
      '          - target: aarch64-apple-darwin',
      '            os: macos-latest',
      '          - target: x86_64-pc-windows-msvc',
      '            os: windows-latest',
      '          - target: aarch64-apple-darwin',
    ].join('\n'),
  );
  assert.deepEqual(targets, ['aarch64-apple-darwin', 'x86_64-pc-windows-msvc']);
  assert.throws(() => releaseTargets('jobs: {}'), /lists no build targets/);
});

test('reads every target the release workflow builds', () => {
  const targets = releaseTargets(fs.readFileSync(RELEASE_WORKFLOW, 'utf8'));
  assert.ok(targets.length >= 6);
  for (const platform of ['apple-darwin', 'linux-gnu', 'windows-msvc']) {
    assert.ok(
      targets.some((target) => target.includes(platform)),
      platform,
    );
  }
});

test('adds the voice feature on every target except Linux, as the release build does', () => {
  assert.deepEqual(featuresForTarget('x86_64-unknown-linux-gnu'), []);
  assert.deepEqual(featuresForTarget('aarch64-apple-darwin'), ['voice']);
  assert.deepEqual(featuresForTarget('x86_64-pc-windows-msvc'), ['voice']);
});

test('ships generated notices for the cli crates', () => {
  assert.equal(CLI_PACKAGE, 'agiworkforce-cli');
  const text = fs.readFileSync(OUTPUT_FILE, 'utf8');
  assert.match(text, /^Command-line tool open-source notices\n=+\n/);
  assert.match(text, /\nPackages \(\d{2,}\)\n/);
  assert.match(text, /\nserde \d+\.\d+\.\d+ \(/);
  assert.match(text, /\nLicense texts\n/);
  assert.doesNotMatch(text, /agiworkforce-/);
});
