/**
 * Runtime Environment Variable Validation
 *
 * This module validates that all required environment variables are set
 * and that Stripe price IDs match between environment variables and
 * hardcoded mappings.
 *
 * Run this at application startup to catch configuration errors early.
 */

import { getAllRegisteredPriceIds } from './price-tier-mapping';
import { STRIPE_PRICE_IDS } from './pricing';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all required environment variables are set
 */
export function validateRequiredEnvVars(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical environment variables (app won't work without these)
  // Missing these will cause server startup to fail in production
  const criticalVars = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

  // DB connection: accept either DATABASE_URL or AGI_DATABASE_URL (mirrors health/route.ts)
  if (!process.env['DATABASE_URL'] && !process.env['AGI_DATABASE_URL']) {
    errors.push('Missing critical environment variable: DATABASE_URL or AGI_DATABASE_URL');
  }

  // Important but non-critical variables (specific features won't work without these)
  // These generate warnings, not errors - server will still start
  const importantVars = [
    // Required for CSRF token verification on state-changing endpoints
    'CSRF_SECRET',
    // Required for protected cron + diagnostic endpoints
    'CRON_SECRET',
    // Required for desktop auto-updates (Tauri updater hits /api/releases/*)
    'DESKTOP_GITHUB_OWNER',
    'DESKTOP_GITHUB_REPO',
    // Redis REST creds (rate limiting) are checked below under EITHER the native
    // Upstash names or Vercel's KV-integration names.
    // Required for encrypting device tokens (push notifications)
    'DEVICE_TOKEN_ENCRYPTION_KEY',
    // Required for TOTP secret encryption (2FA / authenticator app flows)
    'TOTP_ENCRYPTION_KEY',
    // API gateway base URL used by web → backend calls; falls back to localhost:3001
    'NEXT_PUBLIC_API_URL',
  ];

  // Stripe price IDs (required for checkout to work)
  const priceIdVars = ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY'];

  // Optional tiers (waitlist or not yet launched)
  const optionalPriceVars = [
    'STRIPE_PRICE_MAX_MONTHLY',
    'STRIPE_PRICE_TEAM_MONTHLY',
    'STRIPE_PRICE_TEAM_YEARLY',
    'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    'STRIPE_PRICE_ENTERPRISE_YEARLY',
  ];

  // Check critical variables
  for (const varName of criticalVars) {
    if (!process.env[varName]) {
      errors.push(`Missing critical environment variable: ${varName}`);
    }
  }

  // Check important (but non-critical) variables - generate warnings
  for (const varName of importantVars) {
    if (!process.env[varName]) {
      warnings.push(
        `Missing important environment variable: ${varName} (some features may not work)`,
      );
    }
  }

  // Rate limiting needs Redis REST creds under EITHER the native Upstash names
  // or Vercel's KV-integration names (KV_REST_API_*). Warn only if neither pair
  // is present, so a KV_*-only Vercel setup doesn't emit a false warning.
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

  // Check price ID variables
  for (const varName of priceIdVars) {
    if (!process.env[varName]) {
      errors.push(`Missing Stripe price ID: ${varName}`);
    }
  }

  // Check optional enterprise price IDs (warn only)
  for (const varName of optionalPriceVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional Stripe price ID not set: ${varName} (enterprise tier)`);
    }
  }

  // Optional LLM API keys (warn if missing but don't fail)
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

/**
 * Validate that environment variable price IDs match hardcoded mapping
 * This catches configuration drift between pricing.ts and price-tier-mapping.ts
 *
 * NOTE: With dynamic env-based mapping in price-tier-mapping.ts, this check
 * is informational only and won't fail the build.
 */
export function validatePriceIdConsistency(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Get all price IDs from environment variables
    const envPriceIds = Object.values(STRIPE_PRICE_IDS).flatMap((plan) =>
      Object.values(plan).filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    // Get all registered price IDs from dynamic env-based mapping
    const registeredPriceIds = getAllRegisteredPriceIds();

    // Check if env price IDs are registered in mapping (warning only, not error)
    const unregisteredIds = envPriceIds.filter((id) => !registeredPriceIds.includes(id));

    if (unregisteredIds.length > 0) {
      warnings.push(`Price IDs in environment variables: ${unregisteredIds.join(', ')}`);
      warnings.push('These are loaded dynamically from STRIPE_PRICE_* environment variables');
    }

    // Check if registered price IDs are in env (might be outdated mapping)
    const unusedRegisteredIds = registeredPriceIds.filter((id) => !envPriceIds.includes(id));

    if (unusedRegisteredIds.length > 0) {
      warnings.push(
        `Price IDs in hardcoded mapping but not in environment variables: ${unusedRegisteredIds.join(', ')}`,
      );
      warnings.push('These may be old price IDs that should be removed from price-tier-mapping.ts');
    }

    const expectedMappings = {
      pro_monthly: process.env['STRIPE_PRICE_PRO_MONTHLY'],
      pro_yearly: process.env['STRIPE_PRICE_PRO_YEARLY'],
      max_monthly: process.env['STRIPE_PRICE_MAX_MONTHLY'],
      max_yearly: undefined, // Max is monthly-only
    };

    // Log the mappings for debugging
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

/**
 * Detect development/test provider keys running in a PRODUCTION deployment.
 *
 * This is the guard that was missing during the 2026-07-21 incident: production
 * ran Clerk `pk_test_`/`sk_test_` keys, which pass the "is the var set?" check in
 * validateRequiredEnvVars but cause a client-side session-handshake redirect loop
 * on a real domain (dev instances sync sessions via third-party cookies, which
 * Chrome now blocks) — every authenticated page reload-loops. Stripe test keys in
 * production silently accept no real payments.
 *
 * These are warnings, not hard errors: a misconfigured deploy still serves the
 * marketing site, and an emergency hotfix deploy is never blocked. But the
 * misconfiguration is now impossible to miss in build/startup logs.
 */
export function validateProductionKeyTypes(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // VERCEL_ENV === 'production' is the real prod deployment (not preview or
  // local `next dev`, where test keys are correct). Mirrors rate-limit.ts.
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
  ];

  for (const { env, prefix, impact } of testKeyChecks) {
    const value = process.env[env];
    if (value && value.startsWith(prefix)) {
      warnings.push(`${env} is a ${prefix}… development/test key in production — ${impact}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate APP_URL format
 */
export function validateAppUrl(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'];

  if (appUrl) {
    // Check if it's a valid URL
    try {
      const url = new URL(appUrl);

      // Should be HTTPS in production
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        errors.push('APP_URL must use HTTPS in production');
      }

      // Should not have trailing slash
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

/**
 * Run all validations and return combined results
 */
export function validateEnvironment(): ValidationResult {
  const results = [
    validateRequiredEnvVars(),
    validatePriceIdConsistency(),
    validateAppUrl(),
    validateProductionKeyTypes(),
  ];

  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Log validation results to console
 */
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

  console.debug(''); // Empty line for spacing
}

/**
 * Validate environment and throw if invalid (for build-time checks)
 */
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
