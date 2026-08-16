
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
    'LOG_SALT',
    'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND',
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
    warnings.push(
      'Missing Redis REST credentials for rate limiting: set UPSTASH_REDIS_REST_URL/_TOKEN ' +
        'or KV_REST_API_URL/_TOKEN (rate limiting falls back to per-instance in-memory)',
    );
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
      warnings.push(`${env} is a ${prefix}… development/test key in production — ${impact}`);
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
