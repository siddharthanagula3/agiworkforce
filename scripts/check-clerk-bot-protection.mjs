#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const CLERK_API_VERSION = '2026-05-12';
const PUBLISHABLE_KEY_NAME = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
const TARGETS = ['production', 'preview', 'development'];
const HOST_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u;
const PRODUCTION_WEB_URL_DEFAULT = 'https://agiworkforce.com';
const PUBLISHABLE_KEY_PATTERN = /pk_(?:live|test)_[A-Za-z0-9+/=]+/u;
const ANCHORED_PUBLISHABLE_KEY_PATTERNS = [
  /data-clerk-publishable-key="(pk_(?:live|test)_[A-Za-z0-9+/=]+)"/u,
  /publishableKey\\?":\\?"(pk_(?:live|test)_[A-Za-z0-9+/=]+)/u,
];

export class UndecryptedVercelValueError extends Error {}

export function frontendApiHost(publishableKey) {
  const key = publishableKey?.trim();
  const encoded = key?.replace(/^pk_(test|live)_/u, '');
  if (!encoded || encoded === key) return '';
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$+$/u, '');
  return HOST_PATTERN.test(host) ? host : '';
}

export function readBotProtection(environment) {
  const signUp = environment?.user_settings?.sign_up ?? {};
  const display = environment?.display_config ?? {};
  const text = (value) => (typeof value === 'string' && value.length > 0 ? value : 'unknown');
  return {
    captchaEnabled: signUp.captcha_enabled === true,
    signUpMode: text(signUp.mode),
    provider: text(display.captcha_provider),
    widgetType: text(display.captcha_widget_type),
    siteKeyConfigured: Boolean(display.captcha_public_key || display.captcha_public_key_invisible),
  };
}

export function botProtectionFailures(state) {
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
  return failures;
}

export function formatState(host, state) {
  return [
    `Clerk instance ${host}`,
    `- sign-up bot protection: ${state.captchaEnabled ? 'enabled' : 'DISABLED'}`,
    `- captcha provider: ${state.provider}`,
    `- captcha widget: ${state.widgetType}`,
    `- captcha site key provisioned: ${state.siteKeyConfigured ? 'yes' : 'no'}`,
    `- sign-up mode: ${state.signUpMode}`,
  ].join('\n');
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
  const options = { target: 'production' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--target') options.target = argv[++index];
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
    const productionUrl = env.PRODUCTION_WEB_URL?.trim() || PRODUCTION_WEB_URL_DEFAULT;
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
  const { fetchImpl = globalThis.fetch } = deps;
  const options = parseArgs(argv);

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
  const failures = botProtectionFailures(state);
  const report = formatState(host, state);

  if (failures.length === 0) {
    console.log(report);
    return 0;
  }

  console.error(report);
  for (const failure of failures) console.error(`! ${failure}`);
  console.error(
    'Enable bot protection under User & authentication → Attack protection in the Clerk dashboard for this instance.',
  );
  return 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await run();
