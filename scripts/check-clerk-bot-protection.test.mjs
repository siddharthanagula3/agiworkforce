import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UndecryptedVercelValueError,
  botProtectionFailures,
  extractPublishableKeyFromHtml,
  fetchPublishableKeyFromProductionSite,
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
const htmlResponse = (html) => ({ ok: true, status: 200, text: async () => html });

const REALISTIC_PRODUCTION_HTML_FIXTURE = `<!DOCTYPE html><html><head>
<script data-clerk-js-script="true" async crossorigin="anonymous" data-clerk-publishable-key="${FAKE_PUBLISHABLE_KEY}"></script>
</head><body><script>self.__next_f.push([1,"...\\"publishableKey\\":\\"${FAKE_PUBLISHABLE_KEY}\\",\\"__internal_clerkJSUrl\\":\\"$undefined\\"..."])</script></body></html>`;

async function withCapturedStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

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
            decrypted: true,
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

test('a Vercel entry Vercel could not decrypt is rejected instead of treated as the key', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      envs: [
        {
          key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
          value: 'ENC[still-ciphertext]',
          target: ['production'],
          decrypted: false,
        },
      ],
    });

  await assert.rejects(
    fetchPublishableKeyFromVercel({
      token: 'token',
      projectId: 'prj',
      target: 'production',
      fetchImpl,
    }),
    UndecryptedVercelValueError,
  );
});

test('extractPublishableKeyFromHtml finds the key in a realistic production page', () => {
  assert.equal(
    extractPublishableKeyFromHtml(REALISTIC_PRODUCTION_HTML_FIXTURE),
    FAKE_PUBLISHABLE_KEY,
  );
  assert.equal(extractPublishableKeyFromHtml('<html><body>no key here</body></html>'), '');
  assert.equal(extractPublishableKeyFromHtml(undefined), '');
});

test('fetchPublishableKeyFromProductionSite extracts the key from the served page', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return htmlResponse(REALISTIC_PRODUCTION_HTML_FIXTURE);
  };

  const key = await fetchPublishableKeyFromProductionSite({
    productionUrl: 'https://agiworkforce.com',
    fetchImpl,
  });

  assert.equal(key, FAKE_PUBLISHABLE_KEY);
  assert.deepEqual(requested, ['https://agiworkforce.com']);
});

test('fetchPublishableKeyFromProductionSite fails accurately when the page has no key', async () => {
  const fetchImpl = async () => htmlResponse('<html><body>nothing to see</body></html>');

  await assert.rejects(
    fetchPublishableKeyFromProductionSite({ productionUrl: 'https://agiworkforce.com', fetchImpl }),
    /no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY found on the production page/u,
  );
});

test('run falls back to the production page when Vercel cannot decrypt the value, and still passes with a good instance', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.startsWith('https://api.vercel.com/')) {
      return jsonResponse({
        envs: [
          {
            key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
            value: 'ENC[still-ciphertext]',
            target: ['production'],
            decrypted: false,
          },
        ],
      });
    }
    if (url === 'https://agiworkforce.com') {
      return htmlResponse(REALISTIC_PRODUCTION_HTML_FIXTURE);
    }
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  const code = await run([], { VERCEL_TOKEN: 'token', VERCEL_PROJECT_ID: 'prj' }, { fetchImpl });

  assert.equal(code, 0);
  assert.ok(requested.some((url) => url.startsWith('https://api.vercel.com/')));
  assert.ok(requested.includes('https://agiworkforce.com'));
  assert.ok(requested.some((url) => url.startsWith(`https://${FAKE_HOST}/v1/environment`)));
});

test('run reports both failures accurately when Vercel cannot decrypt and the production page has no key', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.vercel.com/')) {
      return jsonResponse({
        envs: [
          {
            key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
            value: 'ENC[still-ciphertext]',
            target: ['production'],
            decrypted: false,
          },
        ],
      });
    }
    return htmlResponse('<html><body>nothing to see</body></html>');
  };

  const lines = await withCapturedStderr(async () => {
    const code = await run([], { VERCEL_TOKEN: 'token', VERCEL_PROJECT_ID: 'prj' }, { fetchImpl });
    assert.equal(code, 1);
  });

  const reported = lines.join('\n');
  assert.match(reported, /undecryptable value/u);
  assert.match(reported, /no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY found on the production page/u);
});
