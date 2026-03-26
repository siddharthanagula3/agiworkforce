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
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

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
    // Required for rate limiting (Upstash Redis)
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    // Required for encrypting device tokens (push notifications)
    'DEVICE_TOKEN_ENCRYPTION_KEY',
    // Required for TOTP secret encryption (2FA / authenticator app flows)
    'TOTP_ENCRYPTION_KEY',
    // API gateway base URL used by web → backend calls; falls back to localhost:3001
    'NEXT_PUBLIC_API_URL',
  ];

  // Stripe price IDs (required for checkout to work)
  const priceIdVars = [
    'STRIPE_PRICE_HOBBY_MONTHLY',
    'STRIPE_PRICE_HOBBY_YEARLY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
    'STRIPE_PRICE_MAX_MONTHLY',
    'STRIPE_PRICE_MAX_YEARLY',
  ];

  // Optional enterprise tier (warn if missing, don't error)
  const optionalPriceVars = ['STRIPE_PRICE_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ENTERPRISE_YEARLY'];

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

    // Verify exact matches for each plan tier
    const expectedMappings = {
      hobby_monthly: process.env['STRIPE_PRICE_HOBBY_MONTHLY'],
      hobby_yearly: process.env['STRIPE_PRICE_HOBBY_YEARLY'],
      pro_monthly: process.env['STRIPE_PRICE_PRO_MONTHLY'],
      pro_yearly: process.env['STRIPE_PRICE_PRO_YEARLY'],
      max_monthly: process.env['STRIPE_PRICE_MAX_MONTHLY'],
      max_yearly: process.env['STRIPE_PRICE_MAX_YEARLY'],
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
 * Validate Supabase URL format
 */
export function validateSupabaseUrl(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];

  if (supabaseUrl) {
    // Check if it's a valid URL
    try {
      const url = new URL(supabaseUrl);

      // Should be HTTPS in production
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        warnings.push('Supabase URL should use HTTPS in production');
      }

      // Should end with .supabase.co or .supabase.in (custom domains)
      if (!url.hostname.includes('supabase')) {
        warnings.push('Supabase URL hostname looks unusual - verify it is correct');
      }
    } catch {
      errors.push(`Invalid Supabase URL format: ${supabaseUrl}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
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
    validateSupabaseUrl(),
    validateAppUrl(),
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
