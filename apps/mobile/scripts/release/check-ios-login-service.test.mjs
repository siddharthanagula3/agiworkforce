import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkIosLoginService, profileBuildEnv } from './check-ios-login-service.mjs';

const VARIABLE = 'EXPO_PUBLIC_AGI_AUTH_PROVIDERS';

function easJsonWith(productionEnv) {
  return {
    build: {
      base: { env: { EXPO_NO_DOTENV: '1' } },
      production: { extends: 'base', env: { APP_ENV: 'production', ...productionEnv } },
    },
  };
}

const unset = easJsonWith({});

test('the configured iOS social login offers the private Apple option', () => {
  assert.deepEqual(checkIosLoginService({ easJson: unset, processValue: 'google,github,apple' }), [
    'google',
    'github',
    'apple',
  ]);
  assert.deepEqual(checkIosLoginService({ easJson: unset, processValue: 'apple' }), ['apple']);
});

test('default, empty, and non-Apple provider lists cannot pass iOS release validation', () => {
  assert.throws(
    () => checkIosLoginService({ easJson: unset, processValue: '' }),
    /Set EXPO_PUBLIC_AGI_AUTH_PROVIDERS/u,
  );
  assert.throws(
    () => checkIosLoginService({ easJson: unset, processValue: 'google,github' }),
    /requires Apple/u,
  );
  assert.throws(
    () => checkIosLoginService({ easJson: unset, processValue: 'unknown' }),
    /requires Apple/u,
  );
});

test('the provider list the build profile carries is the one checked', () => {
  assert.deepEqual(
    checkIosLoginService({
      easJson: easJsonWith({ [VARIABLE]: 'google,github,apple' }),
      processValue: undefined,
    }),
    ['google', 'github', 'apple'],
  );
  assert.throws(
    () =>
      checkIosLoginService({
        easJson: easJsonWith({ [VARIABLE]: 'google,github' }),
        processValue: undefined,
      }),
    /requires Apple/u,
  );
});

test('a build profile without Apple fails even when the release environment lists Apple', () => {
  assert.throws(
    () =>
      checkIosLoginService({
        easJson: easJsonWith({ [VARIABLE]: 'google,github' }),
        processValue: 'google,github,apple',
      }),
    /make them agree/u,
  );
});

test('the release environment must agree with the build profile when both set the list', () => {
  assert.throws(
    () =>
      checkIosLoginService({
        easJson: easJsonWith({ [VARIABLE]: 'google,github,apple' }),
        processValue: 'apple',
      }),
    /make them agree/u,
  );
  assert.deepEqual(
    checkIosLoginService({
      easJson: easJsonWith({ [VARIABLE]: 'google,github,apple' }),
      processValue: 'apple, github ,google',
    }),
    ['google', 'github', 'apple'],
  );
});

test('the profile env follows extends and refuses an unknown profile', () => {
  const easJson = {
    build: {
      base: { env: { [VARIABLE]: 'google' } },
      beta: { extends: 'base', env: { [VARIABLE]: 'google,apple' } },
      inherits: { extends: 'base' },
    },
  };
  assert.equal(profileBuildEnv(easJson, 'beta')[VARIABLE], 'google,apple');
  assert.equal(profileBuildEnv(easJson, 'inherits')[VARIABLE], 'google');
  assert.throws(() => profileBuildEnv(easJson, 'missing'), /no build profile "missing"/u);
  assert.throws(
    () => checkIosLoginService({ profile: 'missing', easJson, processValue: 'apple' }),
    /no build profile/u,
  );
});

test('the checked-in store profiles carry Apple to the iOS build', () => {
  const easJson = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'));
  for (const profile of ['production', 'beta']) {
    assert.ok(
      checkIosLoginService({ profile, easJson, processValue: undefined }).includes('apple'),
      profile,
    );
  }
});
