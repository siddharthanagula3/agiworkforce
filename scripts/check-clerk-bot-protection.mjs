#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const CLERK_BACKEND_API_ORIGIN = 'https://api.clerk.com';
const CLERK_API_VERSION = '2026-05-12';
const PUBLISHABLE_KEY_NAME = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
const SECRET_KEY_NAME = 'CLERK_SECRET_KEY';
const USER_PAGE_SIZE = 500;
const VERIFIED_STATUS = 'verified';
const UNVERIFIED_USERS_FLAG = '--unverified-users';
const TARGETS = ['production', 'preview', 'development'];
const HOST_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u;
const PRODUCTION_WEB_URL_DEFAULT = 'https://agiworkforce.com';
const PUBLISHABLE_KEY_PATTERN = /pk_(?:live|test)_[A-Za-z0-9+/=]+/u;
const ANCHORED_PUBLISHABLE_KEY_PATTERNS = [
  /data-clerk-publishable-key="(pk_(?:live|test)_[A-Za-z0-9+/=]+)"/u,
  /publishableKey\\?":\\?"(pk_(?:live|test)_[A-Za-z0-9+/=]+)/u,
];
const AUTH_CONTRACT_PATH = 'apps/web/features/auth/authContract.ts';
const AUTH_CONTRACT_URL = new URL(`../${AUTH_CONTRACT_PATH}`, import.meta.url);
const STATED_PASSWORD_MIN_LENGTH_PATTERN = /^export const AUTH_PASSWORD_MIN_LENGTH = (\d+);$/mu;
const CLERK_PASSWORD_MIN_LENGTH_FLOOR = 8;
const PASSWORD_CHARACTER_REQUIREMENTS = {
  require_special_char: 'special characters',
  require_numbers: 'numbers',
  require_uppercase: 'uppercase',
  require_lowercase: 'lowercase',
};

export class UndecryptedVercelValueError extends Error {}

export function resolveProductionWebUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) return PRODUCTION_WEB_URL_DEFAULT;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return PRODUCTION_WEB_URL_DEFAULT;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return PRODUCTION_WEB_URL_DEFAULT;
  }
  return trimmed;
}

export function statedPasswordMinLength(source) {
  const match = STATED_PASSWORD_MIN_LENGTH_PATTERN.exec(source ?? '');
  return match ? Number(match[1]) : null;
}

export function frontendApiHost(publishableKey) {
  const key = publishableKey?.trim();
  const encoded = key?.replace(/^pk_(test|live)_/u, '');
  if (!encoded || encoded === key) return '';
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$+$/u, '');
  return HOST_PATTERN.test(host) ? host : '';
}

export function readBotProtection(environment) {
  const signUp = environment?.user_settings?.sign_up ?? {};
  const emailAddress = environment?.user_settings?.attributes?.email_address ?? {};
  const password = environment?.user_settings?.attributes?.password ?? {};
  const passwordSettings = environment?.user_settings?.password_settings ?? {};
  const display = environment?.display_config ?? {};
  const text = (value) => (typeof value === 'string' && value.length > 0 ? value : 'unknown');
  return {
    captchaEnabled: signUp.captcha_enabled === true,
    emailVerifiedAtSignUp: emailAddress.verify_at_sign_up === true,
    signUpMode: text(signUp.mode),
    provider: text(display.captcha_provider),
    widgetType: text(display.captcha_widget_type),
    siteKeyConfigured: Boolean(display.captcha_public_key || display.captcha_public_key_invisible),
    passwordEnabled: password.enabled === true,
    passwordMinLength: Math.max(
      Number.isInteger(passwordSettings.min_length) ? passwordSettings.min_length : 0,
      CLERK_PASSWORD_MIN_LENGTH_FLOOR,
    ),
    breachedPasswordsRefused: passwordSettings.disable_hibp === false,
    passwordStrengthEnforced:
      passwordSettings.show_zxcvbn === true && passwordSettings.min_zxcvbn_strength >= 1,
    unstatedPasswordRequirements: Object.entries(PASSWORD_CHARACTER_REQUIREMENTS)
      .filter(([setting]) => passwordSettings[setting] === true)
      .map(([, requirement]) => requirement),
  };
}

function passwordRuleFailures(state, stated) {
  const failures = [];
  if (state.passwordMinLength !== stated.passwordMinLength) {
    failures.push(
      `the Clerk instance refuses passwords shorter than ${state.passwordMinLength} characters, but the password screen and help article state ${stated.passwordMinLength}`,
    );
  }
  if (!state.breachedPasswordsRefused) {
    failures.push(
      'the Clerk instance accepts a password found in a data breach, which the password screen and help article say is refused',
    );
  }
  if (!state.passwordStrengthEnforced) {
    failures.push(
      'the Clerk instance enforces no minimum password strength, so it accepts a password that is easy to guess, which the password screen and help article say is refused',
    );
  }
  if (state.unstatedPasswordRequirements.length > 0) {
    failures.push(
      `the Clerk instance also requires ${state.unstatedPasswordRequirements.join(', ')}, which the password screen and help article do not state`,
    );
  }
  return failures;
}

export function botProtectionFailures(state, stated = {}) {
  const failures = [];
  if (!state.captchaEnabled) {
    failures.push(
      'sign-up bot protection is disabled on the Clerk instance, so account creation costs an attacker nothing',
    );
  } else if (!state.siteKeyConfigured) {
    failures.push(
      'sign-up bot protection is enabled but no CAPTCHA site key is provisioned, so the widget cannot render',
    );
  }
  if (!state.emailVerifiedAtSignUp) {
    failures.push(
      'sign-up does not verify the email address, so an account opens on an address nobody proved they own',
    );
  }
  if (state.passwordEnabled) failures.push(...passwordRuleFailures(state, stated));
  return failures;
}

function remedies(state, stated) {
  const steps = [];
  if (!state.captchaEnabled || !state.siteKeyConfigured) {
    steps.push(
      'Enable bot protection under User & authentication → Attack protection in the Clerk dashboard for this instance.',
    );
  }
  if (!state.emailVerifiedAtSignUp) {
    steps.push(
      'Turn on Verify at sign-up for email addresses under User & authentication in the Clerk dashboard for this instance.',
      `Then run this check with ${UNVERIFIED_USERS_FLAG} and ${SECRET_KEY_NAME} set to list the accounts created while it was off.`,
    );
  }
  if (state.passwordEnabled && passwordRuleFailures(state, stated).length > 0) {
    steps.push(
      `Make the password requirements on the Password tab of User & authentication in the Clerk dashboard match the rule the password screen states: at least ${stated.passwordMinLength} characters (AUTH_PASSWORD_MIN_LENGTH in ${AUTH_CONTRACT_PATH}), Reject compromised passwords on, a minimum password strength, and no other character requirement. To change the rule instead, change that constant, the password screen copy and the signing-up help article together.`,
    );
  }
  return steps;
}

export function formatState(host, state) {
  return [
    `Clerk instance ${host}`,
    `- sign-up bot protection: ${state.captchaEnabled ? 'enabled' : 'DISABLED'}`,
    `- captcha provider: ${state.provider}`,
    `- captcha widget: ${state.widgetType}`,
    `- captcha site key provisioned: ${state.siteKeyConfigured ? 'yes' : 'no'}`,
    `- email verified at sign-up: ${state.emailVerifiedAtSignUp ? 'yes' : 'NO'}`,
    `- sign-up mode: ${state.signUpMode}`,
    ...(state.passwordEnabled
      ? [
          `- password minimum length: ${state.passwordMinLength}`,
          `- breached passwords refused: ${state.breachedPasswordsRefused ? 'yes' : 'NO'}`,
          `- password strength enforced: ${state.passwordStrengthEnforced ? 'yes' : 'NO'}`,
        ]
      : ['- passwords: not used']),
  ].join('\n');
}

function maskEmailAddress(address) {
  const [local, domain] = typeof address === 'string' ? address.split('@') : [];
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : 'no primary email address';
}

function createdAtOf(user) {
  return Number.isFinite(user?.created_at) ? new Date(user.created_at).toISOString() : 'unknown';
}

export function unverifiedPrimaryEmails(users) {
  return users.flatMap((user) => {
    const primary = (user?.email_addresses ?? []).find(
      (address) => address?.id === user?.primary_email_address_id,
    );
    if (primary?.verification?.status === VERIFIED_STATUS) return [];
    return [
      {
        id: user?.id,
        createdAt: createdAtOf(user),
        email: maskEmailAddress(primary?.email_address),
      },
    ];
  });
}

async function fetchClerkUsers({ secretKey, fetchImpl = globalThis.fetch }) {
  const users = [];
  for (let offset = 0; ; offset += USER_PAGE_SIZE) {
    const query = new URLSearchParams({
      limit: String(USER_PAGE_SIZE),
      offset: String(offset),
      order_by: '-created_at',
    });
    const response = await fetchImpl(`${CLERK_BACKEND_API_ORIGIN}/v1/users?${query}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) {
      throw new Error(`Clerk backend API returned ${response.status} when listing accounts`);
    }
    const body = await response.json();
    const page = Array.isArray(body) ? body : (body?.data ?? []);
    users.push(...page);
    if (page.length < USER_PAGE_SIZE) return users;
  }
}

async function reportUnverifiedUsers(env, publishableKey, fetchImpl) {
  const secretKey = env[SECRET_KEY_NAME]?.trim() ?? '';
  const live = publishableKey.startsWith('pk_live_');
  if (!secretKey.startsWith(live ? 'sk_live_' : 'sk_test_')) {
    console.error(
      `Cannot list accounts: set ${SECRET_KEY_NAME} to the ${live ? 'sk_live_' : 'sk_test_'} secret key of the instance inspected above`,
    );
    return false;
  }

  let users;
  try {
    users = await fetchClerkUsers({ secretKey, fetchImpl });
  } catch (error) {
    console.error(error.message);
    return false;
  }

  const unverified = unverifiedPrimaryEmails(users);
  if (unverified.length === 0) {
    console.log(`All ${users.length} accounts have a verified primary email address.`);
    return true;
  }
  console.error(
    `${unverified.length} of ${users.length} accounts have an unverified primary email address:`,
  );
  for (const account of unverified) {
    console.error(`- ${account.id} created ${account.createdAt} ${account.email}`);
  }
  console.error(
    'Nobody proved they own these addresses. In the Clerk dashboard under Users, verify an address only when its owner is known, and delete or lock every other account.',
  );
  return false;
}

export async function fetchClerkEnvironment({ host, fetchImpl = globalThis.fetch }) {
  const url = `https://${host}/v1/environment?__clerk_api_version=${CLERK_API_VERSION}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Clerk frontend API returned ${response.status} for ${host}`);
  }
  return await response.json();
}

export async function fetchPublishableKeyFromVercel({
  token,
  projectId,
  orgId,
  target,
  fetchImpl = globalThis.fetch,
}) {
  const query = new URLSearchParams({ decrypt: 'true' });
  if (orgId?.startsWith('team_')) query.set('teamId', orgId);

  const response = await fetchImpl(
    `${VERCEL_API_ORIGIN}/v10/projects/${encodeURIComponent(projectId)}/env?${query}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(
      `Vercel environment listing returned ${response.status}; cannot read ${PUBLISHABLE_KEY_NAME}`,
    );
  }

  const body = await response.json();
  const entries = Array.isArray(body) ? body : (body?.envs ?? []);
  for (const entry of entries) {
    if (entry?.key !== PUBLISHABLE_KEY_NAME || entry.gitBranch) continue;
    const entryTargets = Array.isArray(entry.target) ? entry.target : [entry.target];
    if (!entryTargets.includes(target)) continue;
    if (typeof entry.value !== 'string' || !entry.value.trim()) continue;
    if (entry.decrypted === false) {
      throw new UndecryptedVercelValueError(
        `Vercel returned an undecryptable value for ${PUBLISHABLE_KEY_NAME} (sensitive env var, or the token lacks decrypt scope): its "decrypted" field is false, so the value field is ciphertext, not the key`,
      );
    }
    return entry.value.trim();
  }
  return '';
}

export function extractPublishableKeyFromHtml(html) {
  const source = html ?? '';
  for (const pattern of ANCHORED_PUBLISHABLE_KEY_PATTERNS) {
    const match = pattern.exec(source);
    if (match) return match[1];
  }
  const loose = PUBLISHABLE_KEY_PATTERN.exec(source);
  return loose ? loose[0] : '';
}

export async function fetchPublishableKeyFromProductionSite({
  productionUrl,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(productionUrl, { headers: { accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(
      `Production page ${productionUrl} returned ${response.status}; cannot read ${PUBLISHABLE_KEY_NAME} from it`,
    );
  }
  const html = await response.text();
  const key = extractPublishableKeyFromHtml(html);
  if (!key) {
    throw new Error(`no ${PUBLISHABLE_KEY_NAME} found on the production page at ${productionUrl}`);
  }
  return key;
}

function parseArgs(argv) {
  const options = { target: 'production', unverifiedUsers: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--target') options.target = argv[++index];
    else if (argument === UNVERIFIED_USERS_FLAG) options.unverifiedUsers = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!TARGETS.includes(options.target)) throw new Error(`Unknown target: ${options.target}`);
  return options;
}

async function resolvePublishableKey(env, target, fetchImpl) {
  const fromEnv = env[PUBLISHABLE_KEY_NAME]?.trim();
  if (fromEnv) return fromEnv;

  const failures = [];
  if (env.VERCEL_TOKEN && env.VERCEL_PROJECT_ID) {
    try {
      const key = await fetchPublishableKeyFromVercel({
        token: env.VERCEL_TOKEN,
        projectId: env.VERCEL_PROJECT_ID,
        orgId: env.VERCEL_ORG_ID,
        target,
        fetchImpl,
      });
      if (key) return key;
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (target === 'production') {
    const productionUrl = resolveProductionWebUrl(env.PRODUCTION_WEB_URL);
    try {
      return await fetchPublishableKeyFromProductionSite({ productionUrl, fetchImpl });
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length > 0) throw new Error(failures.join('; '));
  return '';
}

export async function run(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const { fetchImpl = globalThis.fetch, readSource = (url) => readFile(url, 'utf8') } = deps;
  const options = parseArgs(argv);

  let passwordMinLength;
  try {
    passwordMinLength = statedPasswordMinLength(await readSource(AUTH_CONTRACT_URL));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (passwordMinLength === null) {
    console.error(
      `Cannot compare the password rule: AUTH_PASSWORD_MIN_LENGTH is not declared in ${AUTH_CONTRACT_PATH}`,
    );
    return 1;
  }
  const stated = { passwordMinLength };

  let publishableKey;
  try {
    publishableKey = await resolvePublishableKey(env, options.target, fetchImpl);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (!publishableKey) {
    console.error(
      `Cannot inspect Clerk bot protection: set ${PUBLISHABLE_KEY_NAME}, or VERCEL_TOKEN and VERCEL_PROJECT_ID so the ${options.target} value can be read`,
    );
    return 1;
  }

  const host = frontendApiHost(publishableKey);
  if (!host) {
    console.error(`${PUBLISHABLE_KEY_NAME} does not decode to a Clerk frontend API host`);
    return 1;
  }

  let environment;
  try {
    environment = await fetchClerkEnvironment({ host, fetchImpl });
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const state = readBotProtection(environment);
  const failures = botProtectionFailures(state, stated);
  const report = formatState(host, state);

  if (failures.length === 0) {
    console.log(report);
  } else {
    console.error(report);
    for (const failure of failures) console.error(`! ${failure}`);
    for (const remedy of remedies(state, stated)) console.error(remedy);
  }

  const accountsClear = options.unverifiedUsers
    ? await reportUnverifiedUsers(env, publishableKey, fetchImpl)
    : true;
  return failures.length === 0 && accountsClear ? 0 : 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await run();
