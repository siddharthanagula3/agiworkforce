import {
  hasObjectStorageCredentials,
  resolveObjectStorageConfig,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage/config';
import { getAllRegisteredPriceIds } from './price-tier-mapping';
import { STRIPE_PRICE_IDS } from './pricing';

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
    'DEVICE_TOKEN_ENCRYPTION_KEY',
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

export function validateProductionKeyTypes(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (process.env['VERCEL_ENV'] !== 'production') {
    return { valid: true, errors, warnings };
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

  for (const { env, prefix, impact } of testKeyChecks) {
    const value = process.env[env];
    if (value && value.startsWith(prefix)) {
      warnings.push(`${env} is a ${prefix}… development/test key in production, ${impact}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
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
