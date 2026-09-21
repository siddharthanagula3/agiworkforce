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
const NOT_PRODUCTION: readonly ConfigEnvironment[] = ['development', 'test', 'preview'];

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

const BOOLEAN_SPELLINGS = ['1', '0', 'true', 'false', 'yes', 'no', 'on', 'off'];

function isBooleanish(value: string): string | null {
  return BOOLEAN_SPELLINGS.includes(value.trim().toLowerCase())
    ? null
    : `it is not one of ${BOOLEAN_SPELLINGS.join(', ')}`;
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

  published('GITHUB_APP_ID', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description:
      'the GitHub App this deployment installs as, without which repository ' + 'linking is off',
  }),
  published('GITHUB_APP_SLUG', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the App handle the install link is built from',
  }),
  published('GITHUB_APP_CLIENT_ID', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the OAuth client a repository owner authorises the install with',
  }),
  secret('GITHUB_APP_CLIENT_SECRET', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the OAuth client secret the install callback exchanges a code with',
  }),
  secret('GITHUB_APP_PRIVATE_KEY_BASE64', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the App signing key, base64 encoded, that mints an installation token',
  }),
  published('GITHUB_BOT_LOGIN', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: 'agi-workforce[bot]',
    requiredIn: [],
    description:
      'the login a webhook treats as this product, so it never reviews its own ' + 'comment',
  }),
  published('GITHUB_PR_REVIEW_MONTHLY_CAP', {
    type: 'integer',
    owner: 'apps/web/lib',
    defaultValue: '100',
    requiredIn: [],
    validate: isPositiveNumber,
    description: 'how many pull request reviews one installation may draw in a month',
  }),
  secret('ANTHROPIC_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential a container file download authenticates to Anthropic with',
  }),
  secret('OPENAI_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential a container file download authenticates to OpenAI with',
  }),
  secret('GEMINI_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description:
      'a Google generative credential, tried after GOOGLE_AI_API_KEY and ' + 'GOOGLE_API_KEY',
  }),
  secret('GOOGLE_AI_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the first Google generative credential embeddings and video status read',
  }),
  secret('GOOGLE_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'a Google credential, tried after GOOGLE_AI_API_KEY',
  }),
  secret('GOOGLE_PLACES_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential the place search tool calls Google Places with',
  }),
  secret('OPENROUTER_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the aggregator credential the free lane and video generation route through',
  }),
  secret('OPENROUTER_WEBHOOK_SECRET', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description:
      'what an OpenRouter video callback body is verified against before a job ' + 'moves',
  }),
  secret('QWEN_API_KEY', {
    type: 'string',
    owner: 'apps/web/app/api/models',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential the free quota completions lane authenticates with',
  }),
  secret('RUNWAY_API_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the credential video generation and status authenticate to Runway with',
  }),
  published('STRIPE_CHECKOUT_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether the server accepts a checkout or top-up request at all',
  }),
  published('NEXT_PUBLIC_CHECKOUT_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether the pricing page offers checkout; kept equal to the server switch',
  }),
  published('PRICE_ID_OVERRIDES', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'a json map that redirects a plan to another price without a deploy',
  }),
  published('STRIPE_PRODUCT_ENTERPRISE', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe product an enterprise contract is billed against',
  }),
  published('BILLING_ALERT_EMAIL', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description:
      'where the collection sweep escalates internally when an owner does not ' + 'answer',
  }),
  published('STRIPE_PRICE_BASIC_MONTHLY_USD', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the basic monthly plan is charged at in USD',
  }),
  published('STRIPE_PRICE_BASIC_MONTHLY_INR', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the basic monthly plan is charged at in INR',
  }),
  published('STRIPE_PRICE_PRO_MONTHLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the pro monthly plan is charged at',
  }),
  published('STRIPE_PRICE_PRO_YEARLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the pro yearly plan is charged at',
  }),
  published('STRIPE_PRICE_MAX_MONTHLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the max monthly plan is charged at',
  }),
  published('STRIPE_PRICE_MAX_15X_MONTHLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price the higher max monthly tier is charged at',
  }),
  published('STRIPE_PRICE_TEAM_MONTHLY_USD', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price a team seat is charged monthly at in USD',
  }),
  published('STRIPE_PRICE_TEAM_MONTHLY_INR', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price a team seat is charged monthly at in INR',
  }),
  published('STRIPE_PRICE_TEAM_YEARLY_USD', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price a team seat is charged yearly at in USD',
  }),
  published('STRIPE_PRICE_ENTERPRISE_MONTHLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price an enterprise contract is charged monthly at',
  }),
  published('STRIPE_PRICE_ENTERPRISE_YEARLY', {
    type: 'string',
    owner: 'apps/web/lib/billing',
    defaultValue: null,
    requiredIn: [],
    description: 'the Stripe price an enterprise contract is charged yearly at',
  }),
  published('MOBILE_IAP_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether the mobile store catalogue is offered at all',
  }),
  published('APPLE_APP_STORE_APP_ID', {
    type: 'integer',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    validate: isPositiveNumber,
    description: 'the numeric App Store id a receipt must name',
  }),
  published('APPLE_APP_STORE_BUNDLE_ID', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the bundle id a store notification must carry to be accepted',
  }),
  published('APPLE_APP_STORE_ENVIRONMENT', {
    type: 'enum',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    validate: oneOf('production', 'sandbox'),
    description: 'which store environment a signed receipt is verified against',
  }),
  published('APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description:
      'the trusted store root certificates, base64 in a json array, a receipt ' +
      'chain is verified to',
  }),
  published(
    'APPLE_APP_STORE_SANDBOX_NOTIFICATIONS_ENABLED',
    {
      type: 'boolean',
      owner: 'apps/web/lib/server',
      defaultValue: null,
      requiredIn: [],
      validate: isBooleanish,
      description:
        'accepts store notifications signed for the sandbox environment, which ' +
        'production must not',
    },
    NOT_PRODUCTION,
  ),
  published('GOOGLE_PLAY_PACKAGE_NAME', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the Play package a purchase notification must name to be accepted',
  }),
  published('GOOGLE_PLAY_PUBSUB_AUDIENCE', {
    type: 'string',
    owner: 'apps/web/app/api/mobile',
    defaultValue: null,
    requiredIn: [],
    description: 'the audience a Play Pub/Sub push token must be issued for',
  }),
  published('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', {
    type: 'string',
    owner: 'apps/web/app/api/mobile',
    defaultValue: null,
    requiredIn: [],
    description: 'the service account a Play Pub/Sub push token must be signed by',
  }),
  secret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description: 'the service account credential a Play purchase is verified with',
  }),
  published('ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: null,
    requiredIn: [],
    description:
      'the Play signing certificate fingerprints the app links association file ' + 'publishes',
  }),
  published('DOCUSIGN_ACCOUNT_ID', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the e-signature account an enterprise contract envelope is created under',
  }),
  published('DOCUSIGN_INTEGRATION_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the integration this deployment authenticates to the e-signature vendor as',
  }),
  published('DOCUSIGN_USER_ID', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the user an envelope is sent on behalf of',
  }),
  secret('DOCUSIGN_PRIVATE_KEY', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the key a JWT grant to the e-signature vendor is signed with',
  }),
  published('DOCUSIGN_API_BASE_URL', {
    type: 'url',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description:
      'the e-signature api origin, which differs between the demo and live ' + 'accounts',
  }),
  published('DOCUSIGN_OAUTH_BASE_URL', {
    type: 'url',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the e-signature token origin, which must match the api origin account',
  }),
  published('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/lib/support',
    defaultValue: '0',
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether a support conversation may be handed to a person',
  }),
  published('AGI_SUPPORT_EXPECTED_REPLY_COPY', {
    type: 'string',
    owner: 'apps/web/lib/support',
    defaultValue: 'within one business day',
    requiredIn: [],
    description:
      'what the handoff tells a customer to expect, which is a promise somebody ' + 'keeps',
  }),
  published('NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/features/support',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether the in-product support widget mounts',
  }),
  published(
    'ACCOUNT_STATUS_FAIL_OPEN',
    {
      type: 'boolean',
      owner: 'apps/web/lib',
      defaultValue: null,
      requiredIn: [],
      validate: isBooleanish,
      description:
        'lets a request through when the account status lookup fails, which is an ' +
        'availability choice over an authorization one',
    },
    LOCAL_ONLY,
  ),
  published(
    'CRON_DEV_BYPASS',
    {
      type: 'boolean',
      owner: 'apps/web/lib/server',
      defaultValue: null,
      requiredIn: [],
      validate: isBooleanish,
      description:
        'accepts an unauthenticated scheduled request from a loopback host while ' +
        'CRON_SECRET is unset',
    },
    LOCAL_ONLY,
  ),
  published('UPLOAD_SCAN_REQUIRED', {
    type: 'boolean',
    owner: 'apps/web/lib/security',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether an upload is refused when no external scanner answers',
  }),
  published('UPLOAD_SCAN_WEBHOOK_URL', {
    type: 'url',
    owner: 'apps/web/lib/security',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the external malware scanner an upload is submitted to',
  }),
  secret('UPLOAD_SCAN_WEBHOOK_TOKEN', {
    type: 'string',
    owner: 'apps/web/lib/security',
    defaultValue: null,
    requiredIn: [],
    description: 'the bearer credential the scanner submission carries',
  }),
  published('MODERATION_HASH_DENYLIST', {
    type: 'string',
    owner: 'apps/web/lib/moderation',
    defaultValue: null,
    requiredIn: [],
    description: 'sha-256 digests of content this deployment refuses, comma separated',
  }),
  published('NEXT_PUBLIC_AGI_BOT_PROTECTION', {
    type: 'enum',
    owner: 'apps/web/lib/security',
    defaultValue: null,
    requiredIn: [],
    validate: oneOf('platform', 'off'),
    description: 'which bot protection mode the sign-up and sign-in forms mount',
  }),
  published('SENTRY_RELEASE', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the release name error reports and spans are attributed to',
  }),
  published('NEXT_PUBLIC_SENTRY_RELEASE', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the release name the browser attributes an error to',
  }),
  published('NEXT_PUBLIC_APP_VERSION', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: 'unknown',
    requiredIn: [],
    description: 'the build the client reports in a feedback report and on a csrf refresh',
  }),
  published('NEXT_PUBLIC_GA_TRACKING_ID', {
    type: 'string',
    owner: 'apps/web/app',
    defaultValue: null,
    requiredIn: [],
    description:
      'the analytics property the marketing pages report to; absent means no ' + 'analytics script',
  }),
  published('LLM_TTFT_SLO_TARGET_MS', {
    type: 'integer',
    owner: 'apps/web/app/api/llm',
    defaultValue: '2500',
    requiredIn: [],
    validate: isPositiveNumber,
    description: 'the time to first token a completion is expected to meet',
  }),
  published('LLM_TTFT_SLO_BREACH_MS', {
    type: 'integer',
    owner: 'apps/web/app/api/llm',
    defaultValue: '5000',
    requiredIn: [],
    validate: isPositiveNumber,
    description: 'the time to first token past which a completion is recorded as a breach',
  }),
  published('WEB_MCP_SERVERS_JSON', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description: 'the tool servers this deployment offers, as json; absent means no MCP ' + 'tools',
  }),
  published('CONNECTOR_MCP_SERVERS_JSON', {
    type: 'string',
    owner: 'apps/web/lib',
    defaultValue: null,
    requiredIn: [],
    description:
      'inline connector tool servers, as json, for a deployment with no connector ' + 'registry',
  }),
  published('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', {
    type: 'url',
    owner: 'apps/web/features/chat',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description:
      'the origin a tool-authored app is framed from, separate from the artifact ' + 'origin',
  }),
  published('SKILLS_LAYERS', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'which skill layers this deployment loads, over the catalogue default',
  }),
  published('AGI_DATABASE_PROVIDER', {
    type: 'string',
    owner: 'apps/web/lib/server',
    defaultValue: 'neon',
    requiredIn: [],
    description: 'which database adapter the pool tuning applies to',
  }),
  published('AGI_PLATFORM_KEY_PROVIDER', {
    type: 'string',
    owner: 'apps/web/lib/crypto',
    defaultValue: 'env',
    requiredIn: [],
    description: 'where platform key material is unsealed from',
  }),
  published('AGI_PROVIDER_PROXY_ORIGIN', {
    type: 'url',
    owner: 'apps/web/lib/e2b',
    defaultValue: null,
    requiredIn: [],
    validate: isUrl,
    description: 'the origin a sandbox reaches the provider proxy on',
  }),
  published('SOFT_DELETED_RESOURCE_PURGE_ENABLED', {
    type: 'boolean',
    owner: 'apps/web/app/api/cron',
    defaultValue: null,
    requiredIn: [],
    validate: isBooleanish,
    description: 'whether the purge sweep deletes soft-deleted rows or only reports them',
  }),
  published('AGI_MAP_GEOCODER_CONTACT', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the contact address the geocoder is told to reach, which its terms require',
  }),
  published('AGI_NOTIFICATIONS_FROM_EMAIL', {
    type: 'string',
    owner: 'apps/web/lib/services',
    defaultValue: null,
    requiredIn: [],
    description: 'the address product notifications and team invitations are sent from',
  }),
  published('NEXT_PUBLIC_COMPOSER_EDITOR', {
    type: 'enum',
    owner: 'apps/web/features/chat',
    defaultValue: null,
    requiredIn: [],
    validate: oneOf('editor', 'textarea'),
    description: 'which composer editor the browser mounts',
  }),
  published('NEXT_PUBLIC_FREE_LANE_UI', {
    type: 'enum',
    owner: 'apps/web/features/chat',
    defaultValue: null,
    requiredIn: [],
    validate: oneOf('on', 'off'),
    description: 'whether the free lane affordances are offered in the browser',
  }),
  published('NEXT_PUBLIC_MESSAGE_VARIANTS', {
    type: 'enum',
    owner: 'apps/web/features/chat',
    defaultValue: null,
    requiredIn: [],
    validate: oneOf('on', 'off'),
    description: 'whether a message keeps its earlier variants after an edit or regenerate',
  }),
];

const CONFIG_KEY_REGISTRY = defineConfigKeys(CONFIG_KEY_DESCRIPTORS);

export function configKeyRegistry() {
  return CONFIG_KEY_REGISTRY;
}

/**
 * A descriptor that contradicts itself is a property of this repository and
 * always refuses the boot. A value this runtime does not recognise is a
 * property of an environment nobody on a branch can read, so in a deployed one
 * it travels with the production findings and the same switch.
 */
export function validateConfigKeyRegistry(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const environmentFindings: string[] = [];
  const sourceFatal = new Set(['secret_exposed_to_client', 'descriptor_incomplete']);
  const environment = resolveRuntimeEnvironment();
  const deployed = environment === 'preview' || environment === 'production';

  for (const violation of checkConfigKeys(CONFIG_KEY_REGISTRY)) {
    if (sourceFatal.has(violation.reason)) {
      errors.push(violation.message);
      continue;
    }
    if (violation.reason === 'invalid_value') {
      (deployed ? environmentFindings : errors).push(violation.message);
      continue;
    }
    const required = environment === 'production' && violation.reason === 'required_and_unset';
    (required ? errors : warnings).push(violation.message);
  }

  const reported = reportProductionFindings(environmentFindings);
  return {
    valid: errors.length === 0 && reported.valid,
    errors: [...errors, ...reported.errors],
    warnings: [...warnings, ...reported.warnings],
  };
}

/**
 * A deployed runtime refuses a value that belongs to another environment. It
 * enumerates the registry, so it measures every key any deployment holds and
 * nobody on a branch can see what that is: the finding is always loud, and the
 * same switch decides whether it also stops the boot.
 */
export function validateDeployedValues(): ValidationResult {
  return reportProductionFindings(
    deployedValueViolations(CONFIG_KEY_REGISTRY).map((violation) => violation.message),
  );
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
