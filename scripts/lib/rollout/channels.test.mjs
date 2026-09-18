import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  RELEASE_CHANNELS,
  channelForTag,
  channelForVersion,
  channelVersionCollisions,
  coreVersion,
  isPrerelease,
  npmDistTag,
  versionForTag,
  vsceChannelArgs,
} from './channels.mjs';
import { parseRolloutRingFlagKey, rolloutRingFlagKey, storeReleaseBlockers } from './rings.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('the channel list matches the web rollout module it mirrors', () => {
  const source = readFileSync(`${REPO_ROOT}apps/web/lib/feature-flags/rollout-rings.ts`, 'utf8');
  const block = /export const RELEASE_CHANNELS = \[([\s\S]*?)\] as const/u.exec(source);
  assert.ok(block, 'rollout-rings.ts no longer declares RELEASE_CHANNELS as a literal list');
  const declared = [...block[1].matchAll(/'([a-z]+)'/gu)].map((match) => match[1]);
  assert.deepEqual(declared, RELEASE_CHANNELS);
});

test('a bare version is stable and a labelled one names its channel', () => {
  assert.equal(channelForVersion('1.4.0'), 'stable');
  assert.equal(channelForVersion('1.4.0-beta.2'), 'beta');
  assert.equal(channelForVersion('1.4.0-rc.1'), 'beta');
  assert.equal(channelForVersion('1.4.0-nightly.20260918'), 'nightly');
  assert.equal(channelForVersion('1.4.0-alpha.1'), 'nightly');
  assert.equal(channelForVersion('1.4.0+build.7'), 'stable');
});

test('a label naming no channel is refused rather than treated as stable', () => {
  assert.throws(() => channelForVersion('1.4.0-experimental.1'), /names no release channel/u);
  assert.throws(() => channelForVersion('nightly'), /not X\.Y\.Z/u);
});

test('a tag resolves to its surface version and channel', () => {
  assert.equal(versionForTag('cli', 'v-cli-1.4.0'), '1.4.0');
  assert.equal(channelForTag('cli', 'v-cli-1.4.0-beta.1'), 'beta');
  assert.equal(channelForTag('vscode', 'v-vscode-2.0.1'), 'stable');
  assert.throws(() => versionForTag('cli', 'v-vscode-1.0.0'), /start with v-cli-/u);
});

test('stable is the only channel a plain install picks up', () => {
  assert.equal(npmDistTag('stable'), 'latest');
  assert.equal(npmDistTag('beta'), 'next');
  assert.equal(npmDistTag('nightly'), 'next');
  assert.deepEqual(vsceChannelArgs('stable'), []);
  assert.deepEqual(vsceChannelArgs('beta'), ['--pre-release']);
  assert.deepEqual(vsceChannelArgs('nightly'), ['--pre-release']);
  assert.equal(isPrerelease('stable'), false);
  assert.equal(isPrerelease('nightly'), true);
});

test('a ring key round-trips and refuses an unknown channel', () => {
  const key = rolloutRingFlagKey({ surface: 'cli', channel: 'beta', id: 'plan_mode' });
  assert.equal(key, 'rollout.cli.beta.plan_mode');
  assert.deepEqual(parseRolloutRingFlagKey(key), {
    surface: 'cli',
    channel: 'beta',
    id: 'plan_mode',
  });
  assert.equal(parseRolloutRingFlagKey('rollout.cli.experimental.plan_mode'), null);
  assert.equal(parseRolloutRingFlagKey('capability.work'), null);
  assert.throws(
    () => rolloutRingFlagKey({ surface: 'cli', channel: 'experimental', id: 'plan_mode' }),
    /not a release channel/u,
  );
});

test('reach cannot be claimed ahead of store approval', () => {
  assert.deepEqual(
    storeReleaseBlockers({
      surface: 'vscode',
      channel: 'stable',
      storeApproval: 'approved',
      percentage: 100,
    }),
    [],
  );
  assert.deepEqual(
    storeReleaseBlockers({
      surface: 'vscode',
      channel: 'stable',
      storeApproval: 'in_review',
      percentage: 0,
    }),
    [],
  );
  assert.equal(
    storeReleaseBlockers({
      surface: 'chrome',
      channel: 'stable',
      storeApproval: 'in_review',
      percentage: 100,
    }).length,
    1,
  );
  assert.match(
    storeReleaseBlockers({
      surface: 'chrome',
      channel: 'stable',
      storeApproval: null,
      percentage: 5,
    })[0],
    /unrecorded/u,
  );
});

test('the same version cannot be published to two channels', () => {
  const tags = ['v-vscode-0.3.0', 'v-vscode-0.4.0-beta.1', 'v-vscode-0.5.0'];
  assert.deepEqual(channelVersionCollisions('vscode', 'v-vscode-0.5.0', tags), []);
  assert.deepEqual(channelVersionCollisions('vscode', 'v-vscode-0.4.0-beta.2', tags), []);
  const collisions = channelVersionCollisions('vscode', 'v-vscode-0.3.0-beta.1', tags);
  assert.equal(collisions.length, 1);
  assert.match(collisions[0], /already claims it on stable/u);
});

test('a prerelease keeps the core version its manifest declares', () => {
  assert.equal(coreVersion('1.4.0-beta.2'), '1.4.0');
  assert.equal(coreVersion('1.4.0+build.7'), '1.4.0');
  assert.equal(coreVersion('1.4.0'), '1.4.0');
});
