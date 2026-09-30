import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkIosLoginService } from './check-ios-login-service.mjs';

test('the configured iOS social login offers the private Apple option', () => {
  assert.deepEqual(checkIosLoginService('google,github,apple'), ['google', 'github', 'apple']);
  assert.deepEqual(checkIosLoginService('apple'), ['apple']);
});

test('default, empty, and non-Apple provider lists cannot pass iOS release validation', () => {
  assert.throws(() => checkIosLoginService(''), /Set EXPO_PUBLIC_AGI_AUTH_PROVIDERS/u);
  assert.throws(() => checkIosLoginService('google,github'), /requires Apple/u);
  assert.throws(() => checkIosLoginService('unknown'), /requires Apple/u);
});
