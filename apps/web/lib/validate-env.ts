import {
  checkConfigKeys,
  defineConfigKeys,
  deployedValueViolations,
  isLoopbackConnectionString,
  resolveRuntimeEnvironment,
  type ConfigKeyDescriptor,
  type RuntimeEnvironment,
} from '@agiworkforce/data-layer';
import {
  hasObjectStorageCredentials,
  resolveObjectStorageConfig,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage/config';
import {
  describeOptionalFeatureDecisions,
  validateOptionalFeatureConfig,
} from './config/optional-features';
import { recordConfigurationState } from './observability/metrics';
import { getAllRegisteredPriceIds } from './price-tier-mapping';
import { STRIPE_PRICE_IDS } from './pricing';
import { totpKeysourceValidationError } from './crypto/totp-keysource';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRequiredEnvVars(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const criticalVars = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

  if (!process.env['DATABASE_URL'] && !process.env['AGI_DATABASE_URL']) {
    errors.push('Missing critical environment variable: DATABASE_URL or AGI_DATABASE_URL');
  }

  const importantVars = [
    'CSRF_SECRET',
    'CRON_SECRET',
    'DESKTOP_GITHUB_OWNER',
    'DESKTOP_GITHUB_REPO',
    'TOTP_ENCRYPTION_KEY',
    'NEXT_PUBLIC_API_URL',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY_BASE64',
    'GITHUB_APP_SLUG',
    'GITHUB_APP_CLIENT_ID',
    'GITHUB_APP_CLIENT_SECRET',
    'GITHUB_WEBHOOK_SECRET',
    'GITHUB_TOKEN_ENCRYPTION_KEY',
    'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
    'CLERK_AUTHORIZED_PARTIES',
    'LOG_SALT',
    'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND',
    // Unset, every platform-operator surface (/admin, the cross-tenant admin
    // APIs) answers 404 to everyone. That fail-closed default is deliberate, so
    // this is a warning rather than a critical variable.
    'AGI_PLATFORM_ADMIN_USER_IDS',
    'IP_HASH_PEPPER',
  ];

  const priceIdVars = [
    'STRIPE_PRICE_BASIC_MONTHLY_USD',
    'STRIPE_PRICE_BASIC_MONTHLY_INR',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
    'STRIPE_PRICE_MAX_MONTHLY',
    'STRIPE_PRICE_MAX_15X_MONTHLY',
  ];

  const optionalPriceVars = [
    'STRIPE_PRICE_TEAM_MONTHLY_USD',
    'STRIPE_PRICE_TEAM_MONTHLY_INR',
    'STRIPE_PRICE_TEAM_YEARLY_USD',
    'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    'STRIPE_PRICE_ENTERPRISE_YEARLY',
  ];

  for (const varName of criticalVars) {
    if (!process.env[varName]) {
      errors.push(`Missing critical environment variable: ${varName}`);
    }
  }

  for (const varName of importantVars) {
    if (!process.env[varName]) {
      warnings.push(
        `Missing important environment variable: ${varName} (some features may not work)`,
      );
    }
  }

  const totpKeysource = process.env['TOTP_ENCRYPTION_KEY'];
  const platformKeyProvider = process.env['AGI_PLATFORM_KEY_PROVIDER']?.trim() || 'env';
  if (totpKeysource && platformKeyProvider === 'env') {
    const error = totpKeysourceValidationError(totpKeysource);
    if (error) errors.push(error);
  }

  const hasRedisRestUrl = !!(
    process.env['UPSTASH_REDIS_REST_URL'] || process.env['KV_REST_API_URL']
  );
  const hasRedisRestToken = !!(
    process.env['UPSTASH_REDIS_REST_TOKEN'] || process.env['KV_REST_API_TOKEN']
  );
  if (!hasRedisRestUrl || !hasRedisRestToken) {
    const message =
      'Missing Redis REST credentials for rate limiting: set UPSTASH_REDIS_REST_URL/_TOKEN ' +
      'or KV_REST_API_URL/_TOKEN. lib/rate-limit.ts throws on import in production ' +
      '(SEV-WEB-13), so the server will not boot without them.';
    if (isProductionRuntime()) errors.push(message);
    else warnings.push(message);
  }

  for (const varName of priceIdVars) {
    if (!process.env[varName]) {
      errors.push(`Missing Stripe price ID: ${varName}`);
    }
  }

  for (const varName of optionalPriceVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional Stripe price ID not set: ${varName} (checkout remains closed)`);
    }
  }

  const optionalLLMKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];

  for (const varName of optionalLLMKeys) {
    if (!process.env[varName]) {
      warnings.push(`Optional LLM API key not set: ${varName}`);
    }
  }

  if (!process.env['GOOGLE_PLACES_API_KEY']) {
    warnings.push(
      'Optional places provider key not set: GOOGLE_PLACES_API_KEY (the search_places tool is ' +
        'not offered, and place questions are answered without live place data)',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePriceIdConsistency(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const envPriceIds = Object.values(STRIPE_PRICE_IDS).flatMap((plan) =>
      Object.values(plan).filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    const registeredPriceIds = getAllRegisteredPriceIds();

    const unregisteredIds = envPriceIds.filter((id) => !registeredPriceIds.includes(id));

    if (unregisteredIds.length > 0) {
      warnings.push(`Price IDs in environment variables: ${unregisteredIds.join(', ')}`);
      warnings.push('These are loaded dynamically from STRIPE_PRICE_* environment variables');
    }

    const unusedRegisteredIds = registeredPriceIds.filter((id) => !envPriceIds.includes(id));

    if (unusedRegisteredIds.length > 0) {
      warnings.push(
        `Price IDs in hardcoded mapping but not in environment variables: ${unusedRegisteredIds.join(', ')}`,
      );
      warnings.push('These may be old price IDs that should be removed from price-tier-mapping.ts');
    }

    const expectedMappings = {
      pro_monthly: STRIPE_PRICE_IDS.pro.monthly,
      pro_yearly: STRIPE_PRICE_IDS.pro.yearly,
      max_monthly: STRIPE_PRICE_IDS.max.monthly,
      max_yearly: undefined, // Max is monthly-only
    };

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[validate-env] Price ID mappings:');
      for (const [key, value] of Object.entries(expectedMappings)) {
        console.debug(`  ${key}: ${value}`);
      }
    }
  } catch (error) {
    errors.push(
      `Error validating price ID consistency: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export const PRODUCTION_CONFIG_ENFORCEMENT_VAR = 'AGI_ENFORCE_PRODUCTION_CONFIG';

const PRODUCTION_VALUE_COMPONENT = 'environment-production-values';

function enforcesProductionConfig(): boolean {
  return process.env['AGI_ENFORCE_PRODUCTION_CONFIG']?.trim() === '1';
}

/**
 * The switch decides whether the site comes up, never whether anybody hears
 * about it. A finding is on the console and on the configuration gauge either
 * way, because the deployment that holds a test key needs to be visible long
 * before anyone is willing to let it refuse to boot.
 */
function reportProductionFindings(findings: readonly string[]): ValidationResult {
  if (findings.length === 0) return { valid: true, errors: [], warnings: [] };

  for (const finding of findings) console.error(`[production-config] ${finding}`);
  recordConfigurationState({ component: PRODUCTION_VALUE_COMPONENT, state: 'invalid' });

  if (enforcesProductionConfig()) return { valid: false, errors: [...findings], warnings: [] };
  return {
    valid: true,
    errors: [],
    warnings: findings.map(
      (finding) =>
        `${finding} The boot continues because ${PRODUCTION_CONFIG_ENFORCEMENT_VAR} is not 1.`,
    ),
  };
}

export function validateProductionKeyTypes(): ValidationResult {
  if (resolveRuntimeEnvironment() !== 'production') {
    return { valid: true, errors: [], warnings: [] };
  }

  const testKeyChecks: Array<{ env: string; prefix: string; impact: string }> = [
    {
      env: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      prefix: 'pk_test_',
      impact:
        'a Clerk DEVELOPMENT instance in production causes auth redirect/handshake loops ' +
        '(dev instances rely on third-party cookies Chrome blocks). Switch to a pk_live_ key.',
    },
    {
      env: 'CLERK_SECRET_KEY',
      prefix: 'sk_test_',
      impact: 'a Clerk development secret key in production. Switch to an sk_live_ key.',
    },
    {
      env: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      prefix: 'pk_test_',
      impact: 'Stripe TEST mode in production accepts no real payments. Switch to a pk_live_ key.',
    },
    {
      env: 'STRIPE_SECRET_KEY',
      prefix: 'sk_test_',
      impact:
        'a Stripe test secret key in production accepts no real payments. Use an sk_live_ key.',
    },
    {
      env: 'STRIPE_SECRET_KEY',
      prefix: 'rk_test_',
      impact:
        'a Stripe test-mode restricted key in production accepts no real payments. Use a live-mode key.',
    },
  ];

  const findings: string[] = [];
  for (const { env, prefix, impact } of testKeyChecks) {
    const value = process.env[env];
    if (value && value.startsWith(prefix)) {
      findings.push(`${env} is a ${prefix}… development/test key in production, ${impact}`);
    }
  }

  return reportProductionFindings(findings);
}

type StripeMode = 'test' | 'live';

function getStripeKeyMode(
  value: string | undefined,
  kind: 'secret' | 'publishable',
): StripeMode | null {
  if (!value) return null;
  if (kind === 'secret') {
    if (/^(?:sk|rk)_test_/.test(value)) return 'test';
    if (/^(?:sk|rk)_live_/.test(value)) return 'live';
    return null;
  }
  if (value.startsWith('pk_test_')) return 'test';
  if (value.startsWith('pk_live_')) return 'live';
  return null;
}

export function validateStripeKeyModeConsistency(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const secretMode = getStripeKeyMode(process.env['STRIPE_SECRET_KEY'], 'secret');
  const publishableMode = getStripeKeyMode(
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    'publishable',
  );

  if (secretMode && publishableMode && secretMode !== publishableMode) {
    errors.push(
      'Stripe key mode mismatch: STRIPE_SECRET_KEY and ' +
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must both be test or both be live.',
    );
  }

  if (
    process.env['VERCEL_ENV'] === 'production' &&
    (secretMode === 'test' || publishableMode === 'test')
  ) {
    errors.push(
      'Stripe test mode is not valid for the Production deployment. Configure live-mode ' +
        'server and publishable keys, or use AGI_ALLOW_INVALID_ENV=1 only for an explicit ' +
        'billing-degraded incident deployment.',
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

const SECURITY_ESCAPE_HATCHES: Array<{ env: string; impact: string }> = [
  {
    env: 'ACCOUNT_STATUS_FAIL_OPEN',
    impact:
      'a failed account-status lookup admits the request, so suspended and banned accounts keep ' +
      'working for as long as the lookup is failing. The default is fail-closed; this turns it off.',
  },
];

const SECURITY_POLICY_DOWNGRADES: Array<{ env: string; value: string; impact: string }> = [
  {
    env: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
    value: 'fail-open',
    impact:
      'a Redis outage stops enforcing rate limits and the per-plan concurrent-turn ceiling, so ' +
      'every caller is admitted unmetered for as long as Redis is unreachable. The production ' +
      'default is fail-closed; this turns it off.',
  },
];

export function validateSecurityEscapeHatches(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enabled = (value: string | undefined) =>
    ['1', 'true', 'on'].includes((value ?? '').toLowerCase());
  const isProduction = () =>
    process.env['VERCEL_ENV'] === 'production' || process.env['NODE_ENV'] === 'production';
  const report = (message: string) => {
    if (isProduction()) errors.push(message);
    else warnings.push(message);
  };

  for (const { env, impact } of SECURITY_ESCAPE_HATCHES) {
    if (!enabled(process.env[env])) continue;
    report(`${env} is enabled, ${impact}`);
  }

  for (const { env, value, impact } of SECURITY_POLICY_DOWNGRADES) {
    if (process.env[env]?.trim().toLowerCase() !== value) continue;
    report(`${env} is set to ${value}, ${impact}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function isProductionRuntime(): boolean {
  const vercelEnv = process.env['VERCEL_ENV'];
  return (
    process.env['NEXT_PHASE'] !== 'phase-production-build' &&
    vercelEnv !== 'preview' &&
    (vercelEnv === 'production' || process.env['NODE_ENV'] === 'production')
  );
}

export function validateEmailPseudonymPepper(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (process.env['EMAIL_HASH_PEPPER']?.trim()) return { valid: true, errors, warnings };

  const message =
    'EMAIL_HASH_PEPPER is not set, email addresses are low-entropy and enumerable, so the ' +
    'unkeyed SHA-256 fallback is reversible by dictionary and is not a pseudonym. Writing a new ' +
    'pseudonym (waitlist joins, consent records, erasure receipts) throws at runtime in ' +
    'production until this is set to 32+ random bytes.';

  if (isProductionRuntime()) errors.push(message);
  else warnings.push(message);

  return { valid: errors.length === 0, errors, warnings };
}

export function validateSandboxOriginConfigured(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']?.trim()) return { valid: true, errors, warnings };

  const message =
    'NEXT_PUBLIC_SANDBOX_ORIGIN is not set, cross-origin artifact isolation degrades to ' +
    'same-origin srcDoc rendering (allow-same-origin is dropped in that fallback, so this is ' +
    'degraded, not unsafe, but it is not the isolation the trust and security pages describe).' +
    (isProductionRuntime()
      ? ' This is a production runtime: set it to the deployed infrastructure/sandbox origin.'
      : '');

  warnings.push(message);
  return { valid: true, errors, warnings };
}

export function validateGeneratedMediaStorage(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = resolveObjectStorageConfig();

  if (!hasObjectStorageCredentials(config)) {
    warnings.push(
      `Object storage credentials are not set (${OBJECT_STORAGE_ENDPOINT_ENV}, ` +
        `${OBJECT_STORAGE_ACCESS_KEY_ID_ENV}, ${OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV} or their ` +
        'CLOUDFLARE_R2_ equivalents), managed image and ' +
        'video generation report storage_not_configured and stay unavailable in the composer.',
    );
    return { valid: true, errors, warnings };
  }

  const { privateBucket, publicBucket } = config;

  if (!privateBucket) {
    warnings.push(
      `${OBJECT_STORAGE_PRIVATE_BUCKET_ENV} or CLOUDFLARE_R2_PRIVATE_BUCKET_NAME is not set, ` +
        'generated media has nowhere private to ' +
        'live, so every managed image and video model reports storage_not_configured and video ' +
        'generation is refused before any credit is reserved.',
    );
  } else if (publicBucket && privateBucket === publicBucket) {
    warnings.push(
      `${OBJECT_STORAGE_PRIVATE_BUCKET_ENV} or CLOUDFLARE_R2_PRIVATE_BUCKET_NAME matches the ` +
        'public bucket, private generated ' +
        'media storage stays disabled until the two name different buckets.',
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateAppUrl(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'];

  if (appUrl) {
    try {
      const url = new URL(appUrl);

      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        errors.push('APP_URL must use HTTPS in production');
      }

      if (appUrl.endsWith('/')) {
        warnings.push('APP_URL should not have trailing slash');
      }
    } catch {
      errors.push(`Invalid APP_URL format: ${appUrl}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

type ConfigEnvironment = RuntimeEnvironment;

const EVERY_ENVIRONMENT: readonly ConfigEnvironment[] = [
  'development',
  'test',
  'preview',
  'production',
];
const DEPLOYED_ONLY: readonly ConfigEnvironment[] = ['preview', 'production'];
const LOCAL_ONLY: readonly ConfigEnvironment[] = ['development', 'test'];

const DEPLOYED_ONLY_ENVS: readonly ConfigEnvironment[] = DEPLOYED_ONLY;

function isUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'it is not an http url';
  } catch {
    return 'it is not a url';
  }
}

function isPostgresUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:'
      ? null
      : 'it is not a postgres connection string';
  } catch {
    return 'it is not a url';
  }
}

function isPositiveNumber(value: string): string | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? null : 'it is not a positive number';
}

function oneOf(...allowed: readonly string[]): (value: string) => string | null {
  return (value) =>
    allowed.includes(value.trim().toLowerCase()) ? null : `it is not one of ${allowed.join(', ')}`;
}

function minimumLength(bytes: number): (value: string) => string | null {
  return (value) =>
    value.trim().length >= bytes ? null : `it is shorter than ${bytes} characters`;
}

type Facets = Omit<ConfigKeyDescriptor, 'key' | 'secrecy' | 'allowedEnvironments' | 'lifecycle'>;

function secret(key: string, facets: Facets, where = EVERY_ENVIRONMENT): ConfigKeyDescriptor {
  return { key, secrecy: 'secret', allowedEnvironments: where, lifecycle: 'in-use', ...facets };
}

function published(key: string, facets: Facets, where = EVERY_ENVIRONMENT): ConfigKeyDescriptor {
  return { key, secrecy: 'public', allowedEnvironments: where, lifecycle: 'in-use', ...facets };
}

/**
 * What each key is and where it may be set. A secret named so the bundler
 * inlines it into client JavaScript is not a secret, and a key meant for one
 * environment set in another is that environment reaching into this one.
 */
const CONFIG_KEY_DESCRIPTORS: readonly ConfigKeyDescriptor[] = [
  secret('CLERK_SECRET_KEY', {
    type: 'string',
    owner: 'identity',
    defaultValue: null,
    requiredIn: EVERY_ENVIRONMENT,
    description: 'the server credential every session lookup authenticates with',
  }),
  secret('STRIPE_SECRET_KEY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'the billing credential checkout, the portal and the webhook reconcile with',
  }),
  secret('STRIPE_WEBHOOK_SECRET', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'what a billing webhook body is verified against before any entitlement moves',
  }),
  secret('CSRF_SECRET', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    validate: minimumLength(32),
    description: 'signs the double submit token every mutating browser request carries',
  }),
  secret('CRON_SECRET', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    validate: minimumLength(32),
    description: 'what every scheduled route authenticates its caller with',
  }),
  secret('TOTP_ENCRYPTION_KEY', {
    type: 'string',
    owner: 'apps/web/lib/crypto',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'seals the second factor secret at rest',
  }),
  secret('GITHUB_WEBHOOK_SECRET', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'verifies a GitHub delivery before any repository state is read',
  }),
  secret('GITHUB_TOKEN_ENCRYPTION_KEY', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'seals a stored installation token at rest',
  }),
  secret('EMAIL_HASH_PEPPER', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    validate: minimumLength(32),
    description: 'keys the email pseudonym, without which the hash is reversible by dictionary',
  }),
  secret('LOG_SALT', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'keys the identifier pseudonyms that reach a log line',
  }),
  secret('IP_HASH_PEPPER', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'keys the address pseudonym an abuse record is kept under',
  }),
  published('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', {
    type: 'string',
    owner: 'identity',
    defaultValue: null,
    requiredIn: EVERY_ENVIRONMENT,
    description: 'the browser half of the identity pair, which must match the secret half',
  }),
  published('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    description: 'the browser half of the billing pair, which must be in the same mode',
  }),
  published('NEXT_PUBLIC_APP_URL', {
    type: 'url',
    owner: 'apps/web',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    validate: isUrl,
    description: 'the origin every generated link, OAuth callback and email names',
  }),
  published('NEXT_PUBLIC_SANDBOX_ORIGIN', {
    type: 'url',
    owner: 'artifacts',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the separate origin an artifact renders in; absent, it degrades to same origin',
  }),
  published('CONNECTOR_OAUTH_REDIRECT_BASE_URL', {
    type: 'url',
    owner: 'apps/web/lib/connectors',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'where a connector authorization code is handed back to',
  }),
  published(
    'VERCEL_ENV',
    {
      type: 'enum',
      owner: 'apps/web',
      defaultValue: null,
      requiredIn: [],
      validate: oneOf('production', 'preview', 'development'),
      description: 'the platform deployment marker, which decides the runtime environment',
    },
    DEPLOYED_ONLY,
  ),
  published(
    'AGI_ALLOW_REMOTE_DATABASE',
    {
      type: 'string',
      owner: 'data-layer',
      defaultValue: null,
      requiredIn: [],
      description: 'the stated override that lets a local runtime reach a shared database',
    },
    LOCAL_ONLY,
  ),
  published('AGI_E2B_COMPUTE_MICROUSD_PER_SECOND', {
    type: 'integer',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: DEPLOYED_ONLY_ENVS,
    validate: isPositiveNumber,
    description: 'what a second of sandbox compute costs, which the cost ledger meters with',
  }),
  published('LOG_LEVEL', {
    type: 'enum',
    owner: 'apps/web/lib',
    defaultValue: 'info',
    requiredIn: [],
    validate: oneOf('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'),
    description: 'the floor a log line must reach; a deployed runtime clamps it to info',
  }),
  published('AGI_OTEL_EXPORTER_ENDPOINT', {
    type: 'url',
    owner: 'observability',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'where spans and metrics are exported; unset, nothing leaves the process',
  }),
  secret('DATABASE_URL', {
    type: 'url',
    owner: 'data-layer',
    defaultValue: null,
    requiredIn: [],
    validate: isPostgresUrl,
    description: 'the database this runtime reaches, checked for environment isolation on connect',
  }),
  secret('AGI_DATABASE_URL', {
    type: 'url',
    owner: 'data-layer',
    defaultValue: null,
    requiredIn: [],
    validate: isPostgresUrl,
    description: 'the database this runtime reaches, preferred over DATABASE_URL when both are set',
  }),
  secret('UPSTASH_REDIS_REST_URL', {
    type: 'url',
    owner: 'key-value',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the shared store rate limiting and the turn ceiling are counted in',
  }),
  secret('UPSTASH_REDIS_REST_TOKEN', {
    type: 'string',
    owner: 'key-value',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential for the shared store rate limiting is counted in',
  }),
  secret('KV_REST_API_URL', {
    type: 'url',
    owner: 'key-value',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the platform alias for the shared store, used when the Upstash pair is unset',
  }),
  secret('KV_REST_API_TOKEN', {
    type: 'string',
    owner: 'key-value',
    defaultValue: null,
    requiredIn: [],
    description: 'the platform alias credential for the shared store',
  }),
  secret('WEB_PUSH_VAPID_PRIVATE_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'signs a push message so the browser push service accepts this deployment',
  }),
  published('WEB_PUSH_VAPID_PUBLIC_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the public half a browser subscribes with, which must pair with the private half',
  }),
  published('WEB_PUSH_VAPID_SUBJECT', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the contact a push service escalates a delivery problem to',
  }),
  secret('RESEND_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/support',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential every transactional email is sent with',
  }),
  secret('SENTRY_DSN', {
    type: 'url',
    owner: 'observability',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'where a server exception is reported; unset, nothing leaves the process',
  }),
  published('NEXT_PUBLIC_SENTRY_DSN', {
    type: 'url',
    owner: 'observability',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'where a browser exception is reported, which the bundle carries by design',
  }),
  published('OTEL_SERVICE_NAME', {
    type: 'string',
    owner: 'observability',
    defaultValue: 'agiworkforce-web',
    requiredIn: [],
    description: 'the service name every span, metric and log line is attributed to',
  }),
  published('NODE_ENV', {
    type: 'enum',
    owner: 'apps/web',
    defaultValue: 'development',
    requiredIn: [],
    validate: oneOf('development', 'test', 'production'),
    description: 'the build mode, used only when no platform deployment marker is set',
  }),
  published('SIGNALING_HTTP_URL', {
    type: 'url',
    owner: 'services/signaling-server',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the pairing service this deployment mints device sessions against',
  }),
  secret('SIGNALING_INTERNAL_SECRET', {
    type: 'string',
    owner: 'services/signaling-server',
    defaultValue: null,
    requiredIn: [],
    description: 'what the pairing service authenticates this deployment with',
  }),
  published('ALLOWED_ORIGINS', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the extra origins allowed to call this deployment beyond its own',
  }),
  secret('CSRF_SECRET_PREV', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the previous signing secret, kept so a rotation does not log everybody out',
  }),
  secret('JWT_SECRET', {
    type: 'string',
    owner: 'apps/web/lib/auth',
    defaultValue: null,
    requiredIn: [],
    description: 'signs the short lived tokens the device and pairing flows exchange',
  }),
  secret('DESKTOP_TOKEN_SECRET', {
    type: 'string',
    owner: 'apps/web/lib/auth',
    defaultValue: null,
    requiredIn: [],
    description: 'signs the token a desktop build exchanges for a cloud session',
  }),
  secret(OBJECT_STORAGE_ENDPOINT_ENV, {
    type: 'url',
    owner: 'object-storage',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the storage endpoint uploads and generated media are written to',
  }),
  secret(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, {
    type: 'string',
    owner: 'object-storage',
    defaultValue: null,
    requiredIn: [],
    description: 'the storage identity uploads are written under',
  }),
  secret(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, {
    type: 'string',
    owner: 'object-storage',
    defaultValue: null,
    requiredIn: [],
    description: 'the storage credential uploads are written with',
  }),
  published(
    'AGI_ENFORCE_PRODUCTION_CONFIG',
    {
      type: 'boolean',
      owner: 'infrastructure',
      defaultValue: null,
      requiredIn: [],
      validate: oneOf('1'),
      description:
        'set to 1 once production is confirmed to hold live credentials, which turns a test key ' +
        'or a placeholder from a warning into a refusal to boot',
    },
    DEPLOYED_ONLY,
  ),
  published(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, {
    type: 'string',
    owner: 'object-storage',
    defaultValue: null,
    requiredIn: [],
    description: 'the bucket private uploads live in, which must differ from the public one',
  }),
];

const CONFIG_KEY_REGISTRY = defineConfigKeys(CONFIG_KEY_DESCRIPTORS);

export function configKeyRegistry() {
  return CONFIG_KEY_REGISTRY;
}

export function validateConfigKeyRegistry(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fatal = new Set(['secret_exposed_to_client', 'descriptor_incomplete', 'invalid_value']);
  for (const violation of checkConfigKeys(CONFIG_KEY_REGISTRY)) {
    const deployed = isProductionRuntime() && violation.reason === 'required_and_unset';
    (fatal.has(violation.reason) || deployed ? errors : warnings).push(violation.message);
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * A deployed runtime refuses a value that belongs to another environment. This
 * is an error rather than a warning because a boot that continues on a test
 * credential looks healthy while every paid action silently does nothing.
 */
export function validateDeployedValues(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const violation of deployedValueViolations(CONFIG_KEY_REGISTRY))
    errors.push(violation.message);
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Every OAuth callback this deployment sends a user to. Each one is a URL an
 * identity provider will hand an authorization code back to.
 */
const OAUTH_CALLBACK_VARS = ['CONNECTOR_OAUTH_REDIRECT_BASE_URL', 'NEXT_PUBLIC_APP_URL'] as const;

/**
 * A callback registered for one environment and reachable from another hands
 * that environment's authorization codes to the wrong deployment. The rule
 * mirrors the database isolation rule: a development runtime redirects to
 * loopback, a deployed runtime redirects to its own https origin.
 */
export function validateOAuthCallbackIsolation(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const environment = resolveRuntimeEnvironment();
  const deployed = environment === 'preview' || environment === 'production';
  const appOrigin = process.env['NEXT_PUBLIC_APP_URL']?.trim();

  for (const name of OAUTH_CALLBACK_VARS) {
    const value = process.env[name]?.trim();
    if (!value) continue;

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      errors.push(`${name} is not a URL, so an OAuth callback through it redirects nowhere.`);
      continue;
    }

    if (!deployed) {
      if (isLoopbackConnectionString(value)) continue;
      warnings.push(
        `${name} sends OAuth callbacks to ${url.host} from a ${environment} runtime. A deployed ` +
          'environment can also reach that host, so authorization codes issued here can land in ' +
          'the wrong deployment. Point it at 127.0.0.1.',
      );
      continue;
    }

    if (url.protocol !== 'https:') {
      errors.push(
        `${name} must use https in ${environment}, not ${url.protocol.replace(':', '')}.`,
      );
      continue;
    }

    if (!appOrigin || name === 'NEXT_PUBLIC_APP_URL') continue;
    try {
      const expected = new URL(appOrigin);
      if (expected.host !== url.host) {
        errors.push(
          `${name} redirects OAuth to ${url.host} while this deployment serves ${expected.host}, ` +
            'so another environment receives its authorization codes.',
        );
      }
    } catch {
      continue;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateEnvironment(): ValidationResult {
  const results = [
    validateRequiredEnvVars(),
    validatePriceIdConsistency(),
    validateAppUrl(),
    validateProductionKeyTypes(),
    validateStripeKeyModeConsistency(),
    validateSecurityEscapeHatches(),
    validateEmailPseudonymPepper(),
    validateSandboxOriginConfigured(),
    validateGeneratedMediaStorage(),
    validateOAuthCallbackIsolation(),
    validateConfigKeyRegistry(),
    validateDeployedValues(),
    validateOptionalFeatureConfig(),
  ];

  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

export function logValidationResults(result: ValidationResult): void {
  for (const decision of describeOptionalFeatureDecisions()) {
    console.debug(`[optional-feature] ${decision}`);
  }

  if (result.valid) {
    console.debug('✅ Environment validation passed');
  } else {
    console.error('❌ Environment validation failed');
  }

  if (result.errors.length > 0) {
    console.error('\n🚨 ERRORS:');
    result.errors.forEach((error) => console.error(`  - ${error}`));
  }

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  WARNINGS:');
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  console.debug('');
}

export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();
  logValidationResults(result);

  if (!result.valid) {
    throw new Error(
      `Environment validation failed with ${result.errors.length} error(s). ` +
        'Check console output for details.',
    );
  }
}
