import assert from 'node:assert/strict';
import test from 'node:test';

import {
  botProtectionFailures,
  fetchPublishableKeyFromVercel,
  frontendApiHost,
  readBotProtection,
  run,
} from './check-clerk-bot-protection.mjs';

const FAKE_HOST = 'clerk.example.test';
const FAKE_PUBLISHABLE_KEY = `pk_test_${Buffer.from(`${FAKE_HOST}$`).toString('base64')}`;

const environmentWith = ({ captchaEnabled, siteKey = 'captcha-site-key', mode = 'public' }) => ({
  user_settings: { sign_up: { captcha_enabled: captchaEnabled, mode } },
  display_config: {
    captcha_provider: 'turnstile',
    captcha_widget_type: 'smart',
    captcha_public_key: siteKey,
    captcha_public_key_invisible: null,
  },
});

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('the frontend API host is decoded from the publishable key', () => {
  assert.equal(frontendApiHost(FAKE_PUBLISHABLE_KEY), FAKE_HOST);
  assert.equal(frontendApiHost('not-a-publishable-key'), '');
  assert.equal(frontendApiHost(undefined), '');
});

test('disabled sign-up bot protection is a failure', () => {
  const state = readBotProtection(environmentWith({ captchaEnabled: false }));

  assert.equal(state.captchaEnabled, false);
  assert.equal(state.signUpMode, 'public');
  assert.deepEqual(botProtectionFailures(state), [
    'sign-up bot protection is disabled on the Clerk instance, so account creation costs an attacker nothing',
  ]);
});

test('enabled bot protection with no provisioned site key is a failure', () => {
  const state = readBotProtection(environmentWith({ captchaEnabled: true, siteKey: null }));

  assert.equal(state.captchaEnabled, true);
  assert.equal(state.siteKeyConfigured, false);
  assert.equal(botProtectionFailures(state).length, 1);
});

test('enabled bot protection with a site key passes', () => {
  const state = readBotProtection(environmentWith({ captchaEnabled: true }));

  assert.equal(state.provider, 'turnstile');
  assert.equal(state.widgetType, 'smart');
  assert.deepEqual(botProtectionFailures(state), []);
});

test('a missing captcha block reads as disabled rather than as unknown-and-passing', () => {
  const state = readBotProtection({});

  assert.equal(state.captchaEnabled, false);
  assert.equal(state.provider, 'unknown');
  assert.equal(botProtectionFailures(state).length, 1);
});

test('run exits non-zero when the live instance has bot protection off', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return jsonResponse(environmentWith({ captchaEnabled: false }));
  };

  const code = await run(
    [],
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    {
      fetchImpl,
    },
  );

  assert.equal(code, 1);
  assert.equal(requested.length, 1);
  assert.match(requested[0], new RegExp(`^https://${FAKE_HOST}/v1/environment\\?`));
  assert.match(requested[0], /__clerk_api_version=/u);
});

test('run exits zero when the live instance has bot protection on', async () => {
  const fetchImpl = async () => jsonResponse(environmentWith({ captchaEnabled: true }));

  const code = await run(
    [],
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    {
      fetchImpl,
    },
  );

  assert.equal(code, 0);
});

test('run fails loudly instead of skipping when no publishable key can be resolved', async () => {
  const code = await run(
    [],
    {},
    {
      fetchImpl: async () => {
        throw new Error('network should not be reached');
      },
    },
  );

  assert.equal(code, 1);
});

test('run reads the production publishable key from Vercel when it is not in the environment', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.startsWith('https://api.vercel.com/')) {
      return jsonResponse({
        envs: [
          {
            key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
            value: FAKE_PUBLISHABLE_KEY,
            target: ['production'],
          },
        ],
      });
    }
    return jsonResponse(environmentWith({ captchaEnabled: false }));
  };

  const code = await run([], { VERCEL_TOKEN: 'token', VERCEL_PROJECT_ID: 'prj' }, { fetchImpl });

  assert.equal(code, 1);
  assert.equal(requested.length, 2);
  assert.match(requested[0], /decrypt=true/u);
});

test('a preview-only publishable key is not mistaken for the production one', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      envs: [
        {
          key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
          value: FAKE_PUBLISHABLE_KEY,
          target: ['preview'],
        },
      ],
    });

  const key = await fetchPublishableKeyFromVercel({
    token: 'token',
    projectId: 'prj',
    target: 'production',
    fetchImpl,
  });

  assert.equal(key, '');
});
