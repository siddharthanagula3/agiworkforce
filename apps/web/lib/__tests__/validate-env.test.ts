/**
 * Tests for lib/validate-env.ts
 *
 * Focuses on the DB URL either-or check:
 *   - Only AGI_DATABASE_URL set -> no DATABASE_URL error (the bug this fixes)
 *   - Only DATABASE_URL set -> no DATABASE_URL error (legacy path still works)
 *   - Neither set -> error includes "DATABASE_URL or AGI_DATABASE_URL"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Suppress side-effect imports that would pull in server-only modules
vi.mock('../price-tier-mapping', () => ({
  getAllRegisteredPriceIds: vi.fn(() => []),
}));

vi.mock('../pricing', () => ({
  STRIPE_PRICE_IDS: {},
}));

// Import after mocks are registered
import { validateRequiredEnvVars } from '../validate-env';

describe('validateRequiredEnvVars · database URL either-or check', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot the full env so we can restore it after each test
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore env to pre-test state
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it('does NOT emit a DATABASE_URL error when only AGI_DATABASE_URL is set', () => {
    delete process.env['DATABASE_URL'];
    process.env['AGI_DATABASE_URL'] = 'postgres://user:pass@host/db';

    const result = validateRequiredEnvVars();

    // The specific DB-missing error must not appear
    const dbError = result.errors.find((e) => e.includes('DATABASE_URL'));
    expect(dbError).toBeUndefined();
  });

  it('does NOT emit a DATABASE_URL error when only DATABASE_URL is set', () => {
    delete process.env['AGI_DATABASE_URL'];
    process.env['DATABASE_URL'] = 'postgres://user:pass@host/db';

    const result = validateRequiredEnvVars();

    const dbError = result.errors.find((e) => e.includes('DATABASE_URL'));
    expect(dbError).toBeUndefined();
  });

  it('DOES emit a DATABASE_URL error when neither DB URL is set', () => {
    delete process.env['DATABASE_URL'];
    delete process.env['AGI_DATABASE_URL'];

    const result = validateRequiredEnvVars();

    const dbError = result.errors.find((e) => e.includes('DATABASE_URL'));
    expect(dbError).toBeDefined();
    expect(dbError).toContain('AGI_DATABASE_URL');
  });
});

// Import after mocks are registered (see top of file).
import { validateProductionKeyTypes } from '../validate-env';

describe('validateProductionKeyTypes · test keys in production', () => {
  let savedEnv: NodeJS.ProcessEnv;
  // Isolate the check from ambient .env keys the runner loads (which are test-mode).
  const CHECKED = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
  ];
  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const k of CHECKED) delete process.env[k];
  });
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('warns when Clerk pk_test_ keys run in a production deployment', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_aGFuZHktdGVzdA';
    const result = validateProductionKeyTypes();
    const w = result.warnings.find((x) => x.includes('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
    expect(w).toBeDefined();
    expect(w).toContain('pk_test_');
    // A warning must never fail startup (a misconfigured deploy still serves the site).
    expect(result.valid).toBe(true);
  });

  it('is silent for pk_live_ keys in production', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_live_aGFuZHktbGl2ZQ';
    process.env['CLERK_SECRET_KEY'] = 'sk_live_abc';
    expect(validateProductionKeyTypes().warnings).toHaveLength(0);
  });

  it('is silent for pk_test_ keys OUTSIDE production (local dev / preview)', () => {
    delete process.env['VERCEL_ENV'];
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_aGFuZHk';
    expect(validateProductionKeyTypes().warnings).toHaveLength(0);
  });
});
