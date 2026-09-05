#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const contracts = {
  desktop: {
    productionExample: 'apps/desktop/.env.example',
    developmentExample: 'apps/desktop/.env.local.example',
    required: {
      production: ['VITE_API_BASE_URL', 'VITE_WEB_APP_URL', 'VITE_GATEWAY_BASE_URL'],
      development: ['VITE_API_BASE_URL', 'VITE_WEB_APP_URL', 'VITE_GATEWAY_BASE_URL'],
    },
    urlKeys: ['VITE_API_BASE_URL', 'VITE_WEB_APP_URL', 'VITE_GATEWAY_BASE_URL'],
  },
  web: {
    productionExample: 'apps/web/.env.example',
    developmentExample: 'apps/web/.env.local.example',
    required: {
      production: [
        'NEXT_PUBLIC_APP_URL',
        'NEXT_PUBLIC_API_URL',
        // Unset, artifacts silently fall back to a same-page srcDoc frame. The
        // fallback is not unsafe (it drops allow-same-origin), but the isolation
        // the trust and security pages describe is the cross-origin renderer, so
        // a production environment without this origin has to be visible drift.
        'NEXT_PUBLIC_SANDBOX_ORIGIN',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'CLERK_SECRET_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'STRIPE_PRICE_PRO_MONTHLY',
        'STRIPE_PRICE_PRO_YEARLY',
        'CLERK_AUTHORIZED_PARTIES',
        'DEVICE_TOKEN_ENCRYPTION_KEY',
        'TOTP_ENCRYPTION_KEY',
        'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        'LOG_SALT',
      ],
      development: [
        'NEXT_PUBLIC_APP_URL',
        'NEXT_PUBLIC_API_URL',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'CLERK_SECRET_KEY',
        'CSRF_SECRET',
        'CRON_SECRET',
        'JWT_SECRET',
        'DEVICE_TOKEN_ENCRYPTION_KEY',
        'TOTP_ENCRYPTION_KEY',
        'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        'LOG_SALT',
      ],
    },
    requiredGroups: {
      production: [
        ['DATABASE_URL', 'AGI_DATABASE_URL'],
        ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'],
        ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'],
      ],
      development: [['DATABASE_URL', 'AGI_DATABASE_URL']],
    },
    productionForbiddenKeys: ['ACCOUNT_STATUS_FAIL_OPEN'],
    productionForbiddenValues: {
      AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY: ['fail-open'],
      AGI_DURABLE_INITIAL_TURNS: ['0', 'false', 'off'],
    },
    // or reached through an exported constant (`E2B_COMPUTE_RATE_ENV`). Pinning
    documentedKeys: [
      'AGI_SUPPORT_FROM_EMAIL',
      'AGI_SUPPORT_FALLBACK_EMAIL',
      'AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS',
      'AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS',
      'AGI_SUPPORT_HANDOFF_IDLE_TIMEOUT_SECONDS',
      'AGI_SUPPORT_HANDOFF_POLL_INTERVAL_MS',
      'AGI_SUPPORT_HANDOFF_RETENTION_DAYS',
      'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
      'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
      'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND',
      'GOOGLE_PLACES_API_KEY',
      'AGI_PLACES_SEARCH_MICROUSD_PER_CALL',
      'AGI_DURABLE_INITIAL_TURNS',
      'AGI_CONTEXT_COMPACTION_ENABLED',
      'AGI_MANAGED_COMPUTE_PRIVATE_BETA',
      'AGI_WEB_MCP_PRIVATE_BETA',
      'ACCOUNT_STATUS_FAIL_OPEN',
      'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
      'AGI_RATE_LIMIT_SCALE',
      'PAGER_WEBHOOK_URL',
    ],
    urlKeys: ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SANDBOX_ORIGIN'],
  },
  mobile: {
    productionExample: 'apps/mobile/.env.example',
    developmentExample: 'apps/mobile/.env.local.example',
    required: {
      production: [
        'APP_ENV',
        'EXPO_PUBLIC_APP_ENV',
        'EXPO_PUBLIC_API_URL',
        'EXPO_PUBLIC_GATEWAY_URL',
        'EXPO_PUBLIC_WS_URL',
        'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
      ],
      development: [
        'APP_ENV',
        'EXPO_PUBLIC_APP_ENV',
        'EXPO_PUBLIC_API_URL',
        'EXPO_PUBLIC_GATEWAY_URL',
        'EXPO_PUBLIC_WS_URL',
      ],
    },
    urlKeys: ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_GATEWAY_URL', 'EXPO_PUBLIC_WS_URL'],
  },
  extension: {
    productionExample: 'apps/extension/.env.example',
    developmentExample: 'apps/extension/.env.local.example',
    required: {
      production: [
        'VITE_AGI_WEB_API_BASE_URL',
        'CLERK_PUBLISHABLE_KEY',
        'CLERK_FRONTEND_API',
        'CLERK_SYNC_HOST',
        'CHROME_EXTENSION_PUBLIC_KEY',
      ],
      development: [
        'VITE_AGI_WEB_API_BASE_URL',
        'CLERK_PUBLISHABLE_KEY',
        'CLERK_FRONTEND_API',
        'CLERK_SYNC_HOST',
      ],
    },
    urlKeys: ['VITE_AGI_WEB_API_BASE_URL', 'CLERK_FRONTEND_API', 'CLERK_SYNC_HOST'],
  },
  cli: {
    productionExample: 'apps/cli/.env.example',
    developmentExample: 'apps/cli/.env.example',
    required: { production: [], development: [] },
    documentedKeys: ['AGI_PLUGIN_REGISTRY_URL'],
    urlKeys: ['AGIWORKFORCE_API_BASE', 'AGI_API_URL', 'AGI_AUTH_BASE'],
  },
  signaling: {
    productionExample: 'services/signaling-server/.env.example',
    developmentExample: 'services/signaling-server/.env.example',
    required: {
      production: [
        'NODE_ENV',
        'SIGNALING_INTERNAL_SECRET',
        'SIGNALING_HTTP_URL',
        'SIGNALING_WS_URL',
        'ALLOWED_ORIGINS',
      ],
      development: ['SIGNALING_INTERNAL_SECRET'],
    },
    requiredGroups: {
      production: [['NEON_DATABASE_URL', 'DATABASE_URL']],
      development: [['NEON_DATABASE_URL', 'DATABASE_URL']],
    },
    urlKeys: ['SIGNALING_HTTP_URL', 'SIGNALING_WS_URL'],
  },
};

const platformProvidedKeys = new Set([
  'COLORFGBG',
  'COLORTERM',
  'COLUMNS',
  'EDITOR',
  'HOME',
  'NEXT_PHASE',
  'NEXT_RUNTIME',
  'NODE_ENV',
  'NO_COLOR',
  'PATH',
  'PATHEXT',
  'SHELL',
  'TERM',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
]);

const sourceScans = [
  {
    scope: 'web',
    include: /^apps\/web\/.*\.[cm]?[jt]sx?$/,
    exclude:
      /^apps\/web\/(?:scripts|e2e|tests)\/|__tests__\/|__mocks__\/|\.test\.|\.spec\.|\.config\.[cm]?[jt]s$/,
    pattern: /process\.env(?:\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]|\.([A-Z][A-Z0-9_]*))/g,
  },
  {
    scope: 'cli',
    include: /^apps\/cli\/src\/.*\.rs$/,
    exclude: /(?:^|\/)tests\//,
    pattern: /env::var(?:_os)?\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g,
  },
];

const staleExampleKeys = new Map([
  ['apps/desktop/.env.example', new Set(['VITE_SIGNALING_URL', 'VITE_SIGNALING_HTTP_URL'])],
  ['apps/desktop/.env.local.example', new Set(['VITE_SIGNALING_URL', 'VITE_SIGNALING_HTTP_URL'])],
]);

function isSet(env, name) {
  return typeof env[name] === 'string' && env[name].trim().length > 0;
}

export function isEscapeHatchEnabled(value) {
  return ['1', 'true', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseArgs(argv) {
  const result = {
    scope: 'all',
    mode: 'development',
    checkExamples: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--scope') result.scope = argv[++index];
    else if (argument === '--mode') result.mode = argv[++index];
    else if (argument === '--check-examples') result.checkExamples = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!['all', ...Object.keys(contracts)].includes(result.scope)) {
    throw new Error(`Unknown scope: ${result.scope}`);
  }
  if (!['development', 'production'].includes(result.mode)) {
    throw new Error(`Unknown mode: ${result.mode}`);
  }
  return result;
}

function parseExampleKeys(contents) {
  const keys = new Set();
  const duplicates = new Set();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match) continue;
    if (keys.has(match[1])) duplicates.add(match[1]);
    keys.add(match[1]);
  }
  return { keys, duplicates };
}

function scanSourceEnvKeys(scan, paths) {
  const readers = new Map();
  for (const path of paths) {
    if (!scan.include.test(path) || scan.exclude.test(path)) continue;
    const absolutePath = join(REPO_ROOT, path);
    if (!existsSync(absolutePath)) continue;
    const contents = readFileSync(absolutePath, 'utf8');
    for (const match of contents.matchAll(scan.pattern)) {
      const name = match[1] ?? match[2];
      if (!readers.has(name)) readers.set(name, path);
    }
  }
  return readers;
}

function checkExampleContracts() {
  const errors = [];
  const parsed = new Map();
  const documentedByScope = new Map();
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const scannable = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter(Boolean);

  for (const [scope, contract] of Object.entries(contracts)) {
    for (const mode of ['production', 'development']) {
      const relativePath =
        mode === 'production' ? contract.productionExample : contract.developmentExample;
      const absolutePath = join(REPO_ROOT, relativePath);
      if (!existsSync(absolutePath)) {
        errors.push(`${scope}: missing ${relativePath}`);
        continue;
      }

      let result = parsed.get(relativePath);
      if (!result) {
        result = parseExampleKeys(readFileSync(absolutePath, 'utf8'));
        parsed.set(relativePath, result);
        for (const duplicate of result.duplicates) {
          errors.push(`${relativePath}: duplicate key ${duplicate}`);
        }
        for (const staleKey of staleExampleKeys.get(relativePath) ?? []) {
          if (result.keys.has(staleKey)) errors.push(`${relativePath}: stale key ${staleKey}`);
        }
      }

      for (const name of contract.required[mode] ?? []) {
        if (!result.keys.has(name)) {
          errors.push(`${relativePath}: missing required ${mode} key ${name}`);
        }
      }
      for (const group of contract.requiredGroups?.[mode] ?? []) {
        if (!group.some((name) => result.keys.has(name))) {
          errors.push(`${relativePath}: missing one of ${group.join(' / ')}`);
        }
      }

      let documented = documentedByScope.get(scope);
      if (!documented) {
        documented = new Set();
        documentedByScope.set(scope, documented);
      }
      for (const name of result.keys) documented.add(name);
    }

    for (const name of contract.documentedKeys ?? []) {
      if (!documentedByScope.get(scope)?.has(name)) {
        errors.push(`${scope}: runtime-composed key ${name} is documented in no example file`);
      }
    }
  }

  for (const scan of sourceScans) {
    const documented = documentedByScope.get(scan.scope) ?? new Set();
    for (const [name, path] of scanSourceEnvKeys(scan, scannable)) {
      if (documented.has(name) || platformProvidedKeys.has(name)) continue;
      errors.push(`${scan.scope}: ${path} reads undocumented environment variable ${name}`);
    }
  }

  for (const path of tracked) {
    const basename = path.split('/').at(-1);
    if (
      basename === '.env' ||
      basename === '.env.local' ||
      (/^\.env\..+/.test(basename) && !basename.endsWith('.example'))
    ) {
      errors.push(`tracked secret-bearing environment file: ${path}`);
    }
  }

  const credentialTempPattern = /\/tmp\/[^'"\s]*(?:credential|secret|conn)[^'"\s]*/i;
  for (const path of tracked) {
    if (!/(^scripts\/|\/scripts\/)/.test(path) || !/\.(?:[cm]?js|ts|sh)$/.test(path)) continue;
    const absolutePath = join(REPO_ROOT, path);
    if (!existsSync(absolutePath)) continue;
    const contents = readFileSync(absolutePath, 'utf8');
    if (credentialTempPattern.test(contents)) {
      errors.push(
        `${relative(REPO_ROOT, absolutePath)}: credentials must come from process environment, not /tmp`,
      );
    }
  }

  return errors;
}

function validateUrl(name, value, mode, errors) {
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} is not an absolute URL`);
    return;
  }

  if (url.username || url.password) {
    errors.push(`${name} must not contain URL credentials`);
  }
  if (mode !== 'production') return;

  const secureProtocols = name.includes('WS_') ? new Set(['wss:']) : new Set(['https:']);
  if (name === 'RATE_LIMIT_REDIS_URL') secureProtocols.add('rediss:');
  if (!secureProtocols.has(url.protocol)) {
    errors.push(`${name} must use ${[...secureProtocols].join(' or ')} in production`);
  }
}

function validateScope(scope, mode, env) {
  const contract = contracts[scope];
  const errors = [];
  const warnings = [];

  for (const name of contract.required[mode] ?? []) {
    if (!isSet(env, name)) errors.push(`missing ${name}`);
  }
  for (const group of contract.requiredGroups?.[mode] ?? []) {
    if (!group.some((name) => isSet(env, name))) {
      errors.push(`missing one of ${group.join(' / ')}`);
    }
  }
  for (const name of contract.urlKeys ?? []) {
    if (isSet(env, name)) validateUrl(name, env[name], mode, errors);
  }
  if (mode === 'production') {
    for (const name of contract.productionForbiddenKeys ?? []) {
      if (isEscapeHatchEnabled(env[name])) {
        errors.push(`${name} is a security escape hatch and must not be enabled in production`);
      }
    }
    for (const [name, values] of Object.entries(contract.productionForbiddenValues ?? {})) {
      const configured = env[name]?.trim().toLowerCase();
      if (configured && values.includes(configured)) {
        errors.push(
          `${name}=${configured} disables a production safety default and must not be set in production`,
        );
      }
    }
  }

  if (scope === 'web') {
    const checkoutServer = env.STRIPE_CHECKOUT_ENABLED === 'true';
    const checkoutClient = env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';
    if (checkoutServer !== checkoutClient) {
      errors.push('STRIPE_CHECKOUT_ENABLED and NEXT_PUBLIC_CHECKOUT_ENABLED must match');
    }
    const redisUrlSet = isSet(env, 'UPSTASH_REDIS_REST_URL') || isSet(env, 'KV_REST_API_URL');
    const redisTokenSet = isSet(env, 'UPSTASH_REDIS_REST_TOKEN') || isSet(env, 'KV_REST_API_TOKEN');
    if (redisUrlSet !== redisTokenSet)
      errors.push('Redis REST URL and token must be configured together');
    if (mode === 'production') {
      for (const [name, prefix] of [
        ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_live_'],
        ['CLERK_SECRET_KEY', 'sk_live_'],
        ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_live_'],
        ['STRIPE_SECRET_KEY', 'sk_live_'],
      ]) {
        if (isSet(env, name) && !env[name].startsWith(prefix)) {
          errors.push(`${name} must use its live-key prefix in production`);
        }
      }
    }
  }

  if (scope === 'mobile') {
    if (isSet(env, 'APP_ENV') && isSet(env, 'EXPO_PUBLIC_APP_ENV')) {
      if (env.APP_ENV !== env.EXPO_PUBLIC_APP_ENV) {
        errors.push('APP_ENV and EXPO_PUBLIC_APP_ENV must match');
      }
    }
    if (mode === 'production' && env.APP_ENV !== 'production') {
      errors.push('APP_ENV must be production');
    }
    if (
      mode === 'production' &&
      isSet(env, 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY') &&
      !env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')
    ) {
      errors.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a live key in production');
    }
  }

  if (scope === 'extension' && mode === 'production') {
    if (isSet(env, 'CLERK_PUBLISHABLE_KEY') && !env.CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')) {
      errors.push('CLERK_PUBLISHABLE_KEY must be a live key in production');
    }
  }

  if (scope === 'signaling' && mode === 'production' && env.NODE_ENV !== 'production') {
    errors.push('NODE_ENV must be production');
  }

  if (
    mode === 'development' &&
    scope === 'mobile' &&
    !isSet(env, 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')
  ) {
    warnings.push(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is unset; the built-in development instance will be used',
    );
  }

  return { errors, warnings };
}

function printHelp() {
  console.log(`Usage:
  pnpm env:doctor -- --scope <scope> --mode <development|production>
  pnpm check:env-contract

Scopes: ${Object.keys(contracts).join(', ')}, all

The doctor reads process.env only. Source your local Zsh configuration before
running it; it never reads dotenv files and never prints values.`);
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  if (options.checkExamples) {
    const errors = checkExampleContracts();
    if (errors.length > 0) {
      console.error('Environment contract check failed:');
      for (const error of errors) console.error(`- ${error}`);
      return 1;
    }
    console.log('Environment examples and credential-handling contract are valid.');
    return 0;
  }

  const scopes = options.scope === 'all' ? Object.keys(contracts) : [options.scope];
  let failed = false;
  for (const scope of scopes) {
    const { errors, warnings } = validateScope(scope, options.mode, env);
    if (errors.length === 0) console.log(`${scope}: ready for ${options.mode}`);
    else {
      failed = true;
      console.error(`${scope}: not ready for ${options.mode}`);
      for (const error of errors) console.error(`- ${error}`);
    }
    for (const warning of warnings) console.warn(`${scope}: warning: ${warning}`);
  }
  return failed ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = run();
