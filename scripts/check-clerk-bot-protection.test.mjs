import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  UndecryptedVercelValueError,
  botProtectionFailures,
  extractPublishableKeyFromHtml,
  fetchPublishableKeyFromProductionSite,
  fetchPublishableKeyFromVercel,
  frontendApiHost,
  readBotProtection,
  resolveProductionWebUrl,
  run,
  statedPasswordMinLength,
  unverifiedPrimaryEmails,
} from './check-clerk-bot-protection.mjs';

const PRODUCTION_WEB_URL_DEFAULT = 'https://agiworkforce.com';

const FAKE_HOST = 'clerk.example.test';
const FAKE_PUBLISHABLE_KEY = `pk_test_${Buffer.from(`${FAKE_HOST}$`).toString('base64')}`;

const CLERK_DEFAULT_PASSWORD_SETTINGS = {
  disable_hibp: false,
  min_length: 0,
  max_length: 0,
  require_special_char: false,
  require_numbers: false,
  require_uppercase: false,
  require_lowercase: false,
  show_zxcvbn: true,
  min_zxcvbn_strength: 2,
  enforce_hibp_on_sign_in: true,
};

const STATED_RULE = { passwordMinLength: 8 };

const environmentWith = ({
  captchaEnabled,
  siteKey = 'captcha-site-key',
  mode = 'public',
  verifyEmailAtSignUp = true,
  passwordSettings,
}) => ({
  user_settings: {
    sign_up: { captcha_enabled: captchaEnabled, mode },
    attributes: {
      email_address: { enabled: true, verify_at_sign_up: verifyEmailAtSignUp },
      ...(passwordSettings ? { password: { enabled: true, required: true } } : {}),
    },
    ...(passwordSettings
      ? { password_settings: { ...CLERK_DEFAULT_PASSWORD_SETTINGS, ...passwordSettings } }
      : {}),
  },
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

const FAKE_SECRET_KEY = 'sk_test_fake-secret';
const BACKEND_USERS_URL = 'https://api.clerk.com/v1/users?';
const CREATED_AT = Date.parse('2026-09-30T12:00:00.000Z');

const accountWith = (id, address, status) => ({
  id,
  created_at: CREATED_AT,
  primary_email_address_id: `idn_${id}`,
  email_addresses: [{ id: `idn_${id}`, email_address: address, verification: { status } }],
});

async function withCapturedOutput(fn) {
  const original = { log: console.log, error: console.error };
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  return lines.join('\n');
}

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

test('resolveProductionWebUrl keeps a real http(s) URL as-is', () => {
  assert.equal(
    resolveProductionWebUrl('https://staging.agiworkforce.com'),
    'https://staging.agiworkforce.com',
  );
  assert.equal(resolveProductionWebUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('resolveProductionWebUrl falls back to the default on unset or unparsable junk', () => {
  // The exact failure this guards: PRODUCTION_WEB_URL was found set to the
  // literal "-" in the production-web GitHub env, which reached fetch() and
  // aborted the monitor with "Failed to parse URL from -" instead of
  // observing the real site.
  assert.equal(resolveProductionWebUrl('-'), PRODUCTION_WEB_URL_DEFAULT);
  assert.equal(resolveProductionWebUrl(''), PRODUCTION_WEB_URL_DEFAULT);
  assert.equal(resolveProductionWebUrl(undefined), PRODUCTION_WEB_URL_DEFAULT);
  assert.equal(resolveProductionWebUrl('   '), PRODUCTION_WEB_URL_DEFAULT);
  assert.equal(resolveProductionWebUrl('not a url'), PRODUCTION_WEB_URL_DEFAULT);
});

test('resolveProductionWebUrl rejects a non-http(s) scheme even when it parses cleanly', () => {
  assert.equal(resolveProductionWebUrl('ftp://x'), PRODUCTION_WEB_URL_DEFAULT);
});

test('run observes production through the default origin when PRODUCTION_WEB_URL is junk, instead of aborting', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url === PRODUCTION_WEB_URL_DEFAULT) return htmlResponse(REALISTIC_PRODUCTION_HTML_FIXTURE);
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  const code = await run([], { PRODUCTION_WEB_URL: '-' }, { fetchImpl });

  assert.equal(code, 0);
  assert.ok(requested.some((url) => url === PRODUCTION_WEB_URL_DEFAULT));
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
  assert.ok(
    botProtectionFailures(state).includes(
      'sign-up bot protection is disabled on the Clerk instance, so account creation costs an attacker nothing',
    ),
  );
});

test('a sign-up that does not verify the email address is a failure', () => {
  const state = readBotProtection(
    environmentWith({ captchaEnabled: true, verifyEmailAtSignUp: false }),
  );

  assert.equal(state.emailVerifiedAtSignUp, false);
  assert.deepEqual(botProtectionFailures(state), [
    'sign-up does not verify the email address, so an account opens on an address nobody proved they own',
  ]);
});

test('a missing email attribute reads as unverified rather than as unknown-and-passing', () => {
  const state = readBotProtection({});

  assert.equal(state.emailVerifiedAtSignUp, false);
  assert.ok(
    botProtectionFailures(state).includes(
      'sign-up does not verify the email address, so an account opens on an address nobody proved they own',
    ),
  );
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

test('run exits non-zero when the live instance lets sign-up skip email verification', async () => {
  const fetchImpl = async () =>
    jsonResponse(environmentWith({ captchaEnabled: true, verifyEmailAtSignUp: false }));

  const lines = await withCapturedStderr(async () => {
    const code = await run(
      [],
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
      { fetchImpl },
    );
    assert.equal(code, 1);
  });

  const reported = lines.join('\n');
  assert.match(reported, /email verified at sign-up: NO/u);
  assert.match(reported, /Verify at sign-up/u);
  assert.doesNotMatch(reported, /Attack protection/u);
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

test('a plain-type Vercel entry with no decrypted field is trusted as real plaintext', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      envs: [
        {
          key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
          type: 'plain',
          value: FAKE_PUBLISHABLE_KEY,
          target: ['production'],
        },
      ],
    });

  const key = await fetchPublishableKeyFromVercel({
    token: 'token',
    projectId: 'prj',
    target: 'production',
    fetchImpl,
  });

  assert.equal(key, FAKE_PUBLISHABLE_KEY);
});

test('extractPublishableKeyFromHtml finds the key in a realistic production page', () => {
  assert.equal(
    extractPublishableKeyFromHtml(REALISTIC_PRODUCTION_HTML_FIXTURE),
    FAKE_PUBLISHABLE_KEY,
  );
  assert.equal(extractPublishableKeyFromHtml('<html><body>no key here</body></html>'), '');
  assert.equal(extractPublishableKeyFromHtml(undefined), '');
});

test('extractPublishableKeyFromHtml prefers the anchored clerk key over an earlier pk_ token', () => {
  const decoyed = `<script src="https://third-party.example/pk_live_REVPWURFQ09Z"></script>${REALISTIC_PRODUCTION_HTML_FIXTURE}`;
  assert.equal(extractPublishableKeyFromHtml(decoyed), FAKE_PUBLISHABLE_KEY);
  assert.equal(
    extractPublishableKeyFromHtml(
      '<script src="https://third-party.example/pk_live_REVPWURFQ09Z"></script>',
    ),
    'pk_live_REVPWURFQ09Z',
  );
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
  assert.ok(requested.some((url) => url === 'https://agiworkforce.com'));
  assert.ok(requested.some((url) => url.startsWith(`https://${FAKE_HOST}/v1/environment`)));
});

test('run falls back to the production page when the Vercel call itself fails, not only on undecrypted ciphertext', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.startsWith('https://api.vercel.com/')) {
      return { ok: false, status: 401, json: async () => ({}) };
    }
    if (url === 'https://agiworkforce.com') {
      return htmlResponse(REALISTIC_PRODUCTION_HTML_FIXTURE);
    }
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  const code = await run([], { VERCEL_TOKEN: 'token', VERCEL_PROJECT_ID: 'prj' }, { fetchImpl });

  assert.equal(code, 0);
  assert.ok(requested.some((url) => url.startsWith('https://api.vercel.com/')));
  assert.ok(requested.some((url) => url === 'https://agiworkforce.com'));
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

test('an account whose primary email address is unverified is listed, masked; a verified one is not', () => {
  const listed = unverifiedPrimaryEmails([
    accountWith('user_unproven', 'victim@corp.example', 'unverified'),
    accountWith('user_proven', 'owner@corp.example', 'verified'),
    { id: 'user_without_email', created_at: CREATED_AT, email_addresses: [] },
  ]);

  assert.deepEqual(listed, [
    { id: 'user_unproven', createdAt: '2026-09-30T12:00:00.000Z', email: 'v***@corp.example' },
    {
      id: 'user_without_email',
      createdAt: '2026-09-30T12:00:00.000Z',
      email: 'no primary email address',
    },
  ]);
});

test('run lists the accounts created with an unproven address and fails while any remain', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, authorization: init?.headers?.authorization });
    if (url.startsWith(BACKEND_USERS_URL)) {
      return jsonResponse([
        accountWith('user_unproven', 'victim@corp.example', 'unverified'),
        accountWith('user_proven', 'owner@corp.example', 'verified'),
      ]);
    }
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  let code;
  const output = await withCapturedOutput(async () => {
    code = await run(
      ['--unverified-users'],
      {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: FAKE_SECRET_KEY,
      },
      { fetchImpl },
    );
  });

  assert.equal(code, 1);
  assert.match(output, /1 of 2 accounts have an unverified primary email address/u);
  assert.match(output, /user_unproven created 2026-09-30T12:00:00\.000Z v\*\*\*@corp\.example/u);
  assert.doesNotMatch(output, /victim@corp\.example/u);
  assert.doesNotMatch(output, /user_proven/u);
  const listing = requests.find((request) => request.url.startsWith(BACKEND_USERS_URL));
  assert.equal(listing.authorization, `Bearer ${FAKE_SECRET_KEY}`);
});

test('run reads every page of accounts before it reports', async () => {
  const pageSize = 500;
  const offsets = [];
  const fetchImpl = async (url) => {
    if (url.startsWith(BACKEND_USERS_URL)) {
      const query = new URL(url).searchParams;
      offsets.push(query.get('offset'));
      assert.equal(query.get('limit'), String(pageSize));
      if (query.get('offset') === '0') {
        return jsonResponse(
          Array.from({ length: pageSize }, (_, index) =>
            accountWith(`user_${index}`, `person${index}@corp.example`, 'verified'),
          ),
        );
      }
      return jsonResponse([accountWith('user_last', 'last@corp.example', 'unverified')]);
    }
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  const output = await withCapturedOutput(async () => {
    const code = await run(
      ['--unverified-users'],
      {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: FAKE_SECRET_KEY,
      },
      { fetchImpl },
    );
    assert.equal(code, 1);
  });

  assert.deepEqual(offsets, ['0', String(pageSize)]);
  assert.match(output, /1 of 501 accounts/u);
  assert.match(output, /user_last/u);
});

test('run passes the account listing when every primary address is verified', async () => {
  const fetchImpl = async (url) =>
    url.startsWith(BACKEND_USERS_URL)
      ? jsonResponse([accountWith('user_proven', 'owner@corp.example', 'verified')])
      : jsonResponse(environmentWith({ captchaEnabled: true }));

  const output = await withCapturedOutput(async () => {
    const code = await run(
      ['--unverified-users'],
      {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: FAKE_SECRET_KEY,
      },
      { fetchImpl },
    );
    assert.equal(code, 0);
  });

  assert.match(output, /all 1 accounts have a verified primary email address/iu);
});

test('run will not list accounts without a secret key for the same kind of instance', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return jsonResponse(environmentWith({ captchaEnabled: true }));
  };

  for (const env of [
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY, CLERK_SECRET_KEY: 'sk_live_other' },
  ]) {
    const output = await withCapturedOutput(async () => {
      const code = await run(['--unverified-users'], env, { fetchImpl });
      assert.equal(code, 1);
    });
    assert.match(output, /CLERK_SECRET_KEY/u);
  }

  assert.ok(requested.every((url) => !url.startsWith(BACKEND_USERS_URL)));
});

test('a sign-up that skips email verification names the account listing as the next step', async () => {
  const fetchImpl = async () =>
    jsonResponse(environmentWith({ captchaEnabled: true, verifyEmailAtSignUp: false }));

  const lines = await withCapturedStderr(async () => {
    await run([], { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY }, { fetchImpl });
  });

  assert.match(lines.join('\n'), /--unverified-users/u);
});

test('the password rule the screen states holds on an instance at the Clerk defaults', () => {
  const state = readBotProtection(environmentWith({ captchaEnabled: true, passwordSettings: {} }));

  assert.equal(state.passwordMinLength, 8);
  assert.deepEqual(botProtectionFailures(state, STATED_RULE), []);
});

test('a longer minimum password length on the instance than the screen states is a failure', () => {
  const state = readBotProtection(
    environmentWith({ captchaEnabled: true, passwordSettings: { min_length: 12 } }),
  );

  assert.deepEqual(botProtectionFailures(state, STATED_RULE), [
    'the Clerk instance refuses passwords shorter than 12 characters, but the password screen and help article state 8',
  ]);
});

test('an instance that accepts a breached or easily guessed password is a failure', () => {
  const breached = readBotProtection(
    environmentWith({ captchaEnabled: true, passwordSettings: { disable_hibp: true } }),
  );
  assert.deepEqual(botProtectionFailures(breached, STATED_RULE), [
    'the Clerk instance accepts a password found in a data breach, which the password screen and help article say is refused',
  ]);

  const strengthFailure =
    'the Clerk instance enforces no minimum password strength, so it accepts a password that is easy to guess, which the password screen and help article say is refused';
  for (const passwordSettings of [{ min_zxcvbn_strength: 0 }, { show_zxcvbn: false }]) {
    const unchecked = readBotProtection(
      environmentWith({ captchaEnabled: true, passwordSettings }),
    );
    assert.deepEqual(botProtectionFailures(unchecked, STATED_RULE), [strengthFailure]);
  }
});

test('a character requirement the password screen does not state is a failure', () => {
  const state = readBotProtection(
    environmentWith({
      captchaEnabled: true,
      passwordSettings: { require_uppercase: true, require_numbers: true },
    }),
  );

  assert.deepEqual(botProtectionFailures(state, STATED_RULE), [
    'the Clerk instance also requires numbers, uppercase, which the password screen and help article do not state',
  ]);
});

test('a missing password settings block reads as unenforced rather than as passing', () => {
  const state = readBotProtection({
    user_settings: { attributes: { password: { enabled: true } } },
  });

  assert.equal(state.passwordMinLength, 8);
  const failures = botProtectionFailures(state, STATED_RULE);
  assert.ok(failures.some((failure) => /data breach/u.test(failure)));
  assert.ok(failures.some((failure) => /minimum password strength/u.test(failure)));
});

test('an instance that does not use passwords is not held to the password rule', () => {
  const state = readBotProtection({
    user_settings: {
      sign_up: { captcha_enabled: true },
      attributes: {
        email_address: { verify_at_sign_up: true },
        password: { enabled: false },
      },
      password_settings: { ...CLERK_DEFAULT_PASSWORD_SETTINGS, disable_hibp: true },
    },
    display_config: { captcha_public_key: 'captcha-site-key' },
  });

  assert.deepEqual(botProtectionFailures(state, STATED_RULE), []);
});

test('the stated minimum is read from the auth contract the password screen renders', () => {
  const source = readFileSync(
    new URL('../apps/web/features/auth/authContract.ts', import.meta.url),
    'utf8',
  );

  assert.ok(Number.isInteger(statedPasswordMinLength(source)));
  assert.equal(statedPasswordMinLength('export const AUTH_PASSWORD_MIN_LENGTH = 12;\n'), 12);
  assert.equal(statedPasswordMinLength('export const AUTH_CODE_LENGTH = 6;\n'), null);
  assert.equal(statedPasswordMinLength(undefined), null);
});

test('run fails when the instance refuses passwords the screen says are long enough', async () => {
  const fetchImpl = async () =>
    jsonResponse(environmentWith({ captchaEnabled: true, passwordSettings: { min_length: 12 } }));

  const lines = await withCapturedStderr(async () => {
    const code = await run(
      [],
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
      { fetchImpl, readSource: async () => 'export const AUTH_PASSWORD_MIN_LENGTH = 8;\n' },
    );
    assert.equal(code, 1);
  });

  const reported = lines.join('\n');
  assert.match(reported, /password minimum length: 12/u);
  assert.match(reported, /AUTH_PASSWORD_MIN_LENGTH/u);
});

test('run passes an instance whose password rule matches the screen', async () => {
  const fetchImpl = async () =>
    jsonResponse(environmentWith({ captchaEnabled: true, passwordSettings: {} }));

  const output = await withCapturedOutput(async () => {
    const code = await run(
      [],
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
      { fetchImpl, readSource: async () => 'export const AUTH_PASSWORD_MIN_LENGTH = 8;\n' },
    );
    assert.equal(code, 0);
  });

  assert.match(output, /password minimum length: 8/u);
  assert.match(output, /breached passwords refused: yes/u);
  assert.match(output, /password strength enforced: yes/u);
});

test('run fails closed when it cannot read the minimum the screen states', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return jsonResponse(environmentWith({ captchaEnabled: true, passwordSettings: {} }));
  };

  const lines = await withCapturedStderr(async () => {
    const code = await run(
      [],
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
      { fetchImpl, readSource: async () => '' },
    );
    assert.equal(code, 1);
  });

  assert.match(lines.join('\n'), /AUTH_PASSWORD_MIN_LENGTH/u);
  assert.deepEqual(requested, []);
});
