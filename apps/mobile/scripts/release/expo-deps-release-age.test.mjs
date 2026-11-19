import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyMismatch,
  classifyMismatches,
  parseCheckOutput,
  parseExpectedRange,
  parseVersion,
  readReleaseAgePolicy,
} from './expo-deps-release-age.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const SEVEN_DAYS = { minutes: 7 * 24 * 60, excluded: new Set() };

const published = {
  '57.0.30': '2026-10-15T09:00:00.000Z',
  '57.0.31': '2026-10-21T09:00:00.000Z',
  '57.0.32': '2026-11-05T09:00:00.000Z',
  '57.0.33': '2026-11-12T13:00:00.000Z',
  '58.0.0-preview.1': '2026-11-13T09:00:00.000Z',
};

function mismatch(actualVersion, expectedVersionOrRange = '~57.0.33') {
  return {
    packageName: 'expo',
    packageType: 'dependencies',
    expectedVersionOrRange,
    actualVersion,
  };
}

test('a patch younger than the release-age rule is held, not outdated', () => {
  const result = classifyMismatch({
    dependency: mismatch('57.0.32'),
    publishedAt: published,
    policy: SEVEN_DAYS,
    now: NOW,
  });
  assert.equal(result.status, 'held');
  assert.equal(result.unlocksAt, '2026-11-19T13:00:00.000Z');
});

test('the same patch is outdated once it is old enough to install', () => {
  const result = classifyMismatch({
    dependency: mismatch('57.0.32'),
    publishedAt: published,
    policy: SEVEN_DAYS,
    now: Date.parse('2026-11-19T13:00:00.000Z'),
  });
  assert.equal(result.status, 'outdated');
  assert.match(result.reason, /57\.0\.33 can be installed now/);
});

test('being behind the newest installable patch is outdated even while a newer one is held', () => {
  const result = classifyMismatch({
    dependency: mismatch('57.0.31'),
    publishedAt: published,
    policy: SEVEN_DAYS,
    now: NOW,
  });
  assert.equal(result.status, 'outdated');
  assert.match(result.reason, /57\.0\.32 can be installed now/);
});

test('a release-age exclusion makes the expected patch installable', () => {
  const result = classifyMismatch({
    dependency: mismatch('57.0.32'),
    publishedAt: published,
    policy: { minutes: SEVEN_DAYS.minutes, excluded: new Set(['expo@57.0.33']) },
    now: NOW,
  });
  assert.equal(result.status, 'outdated');
});

test('fails closed without a rule, without publish dates and on a range it cannot read', () => {
  const base = { dependency: mismatch('57.0.32'), publishedAt: published, now: NOW };
  assert.equal(
    classifyMismatch({ ...base, policy: { minutes: 0, excluded: new Set() } }).status,
    'outdated',
  );
  assert.equal(
    classifyMismatch({ ...base, publishedAt: undefined, policy: SEVEN_DAYS }).status,
    'outdated',
  );
  assert.equal(
    classifyMismatch({
      ...base,
      dependency: mismatch('57.0.32', '>=57.0.33 <58'),
      policy: SEVEN_DAYS,
    }).status,
    'outdated',
  );
  assert.equal(
    classifyMismatch({
      ...base,
      dependency: mismatch('57.0.32', '~57.0.40'),
      policy: SEVEN_DAYS,
    }).status,
    'outdated',
  );
});

test('an exact expected version is held only while that version is too young', () => {
  const young = classifyMismatch({
    dependency: mismatch('57.0.32', '57.0.33'),
    publishedAt: published,
    policy: SEVEN_DAYS,
    now: NOW,
  });
  assert.equal(young.status, 'held');
  const mature = classifyMismatch({
    dependency: mismatch('57.0.31', '57.0.32'),
    publishedAt: published,
    policy: SEVEN_DAYS,
    now: NOW,
  });
  assert.equal(mature.status, 'outdated');
});

test('one outdated package fails the set while the rest are held', () => {
  const { held, outdated } = classifyMismatches({
    dependencies: [
      mismatch('57.0.32'),
      { ...mismatch('57.0.4', '~57.0.6'), packageName: 'expo-calendar' },
    ],
    publishedAtByPackage: {
      expo: published,
      'expo-calendar': {
        '57.0.4': '2026-09-01T09:00:00.000Z',
        '57.0.6': new Date(NOW - 20 * DAY_MS).toISOString(),
      },
    },
    policy: SEVEN_DAYS,
    now: NOW,
  });
  assert.deepEqual(
    held.map((entry) => entry.packageName),
    ['expo'],
  );
  assert.deepEqual(
    outdated.map((entry) => entry.packageName),
    ['expo-calendar'],
  );
});

test('reads the rule and its exclusions from the workspace file', () => {
  const policy = readReleaseAgePolicy(
    [
      'packages:',
      "  - 'apps/*'",
      'minimumReleaseAge: 10080',
      '',
      'minimumReleaseAgeExclude:',
      "  - 'glob@14.0.2'",
      "  - '@next/env@16.4.3'",
      'onlyBuiltDependencies:',
      '  - esbuild',
      '',
    ].join('\n'),
  );
  assert.equal(policy.minutes, 10080);
  assert.deepEqual([...policy.excluded], ['glob@14.0.2', '@next/env@16.4.3']);
  assert.equal(readReleaseAgePolicy('packages:\n').minutes, 0);
});

test('reads the check result after the lines the command prints before it', () => {
  const parsed = parseCheckOutput(
    'env: load .env.local\nenv: export APP_ENV\n{\n  "dependencies": [],\n  "upToDate": true\n}\n',
  );
  assert.deepEqual(parsed, { dependencies: [], upToDate: true });
  assert.equal(parseCheckOutput('Found outdated dependencies'), null);
  assert.equal(parseCheckOutput('{"upToDate": "yes"}'), null);
});

test('ranges follow tilde, caret and exact rules and skip pre-releases', () => {
  assert.equal(parseVersion('58.0.0-preview.1'), null);
  assert.equal(parseExpectedRange('~57.0.33').satisfies([57, 0, 40]), true);
  assert.equal(parseExpectedRange('~57.0.33').satisfies([57, 1, 0]), false);
  assert.equal(parseExpectedRange('^4.26.0').satisfies([4, 30, 1]), true);
  assert.equal(parseExpectedRange('^0.4.1').satisfies([0, 5, 0]), false);
  assert.equal(parseExpectedRange('12.0.1').satisfies([12, 0, 2]), false);
  assert.equal(parseExpectedRange('latest'), null);
});
