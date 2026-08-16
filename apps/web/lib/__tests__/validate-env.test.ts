
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../price-tier-mapping', () => ({
  getAllRegisteredPriceIds: vi.fn(() => []),
}));

vi.mock('../pricing', () => ({
  STRIPE_PRICE_IDS: {},
}));

import { validateRequiredEnvVars } from '../validate-env';

describe('validateRequiredEnvVars · database URL either-or check', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
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

  it('warns when GitHub App user-authorization credentials are missing', () => {
    delete process.env['GITHUB_APP_CLIENT_ID'];
    delete process.env['GITHUB_APP_CLIENT_SECRET'];

    const result = validateRequiredEnvVars();

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GITHUB_APP_CLIENT_ID'),
        expect.stringContaining('GITHUB_APP_CLIENT_SECRET'),
      ]),
    );
  });
});

import { validateProductionKeyTypes, validateStripeKeyModeConsistency } from '../validate-env';

describe('validateProductionKeyTypes · test keys in production', () => {
  let savedEnv: NodeJS.ProcessEnv;
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

describe('validateStripeKeyModeConsistency', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('rejects a test secret paired with a live publishable key', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_server';
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] = 'pk_live_browser';

    const result = validateStripeKeyModeConsistency();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining('Stripe key mode mismatch')]);
  });

  it('accepts a restricted live key paired with a live publishable key', () => {
    process.env['STRIPE_SECRET_KEY'] = 'rk_live_server';
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] = 'pk_live_browser';

    expect(validateStripeKeyModeConsistency()).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects an otherwise-consistent test key pair in Production', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'rk_test_server';
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] = 'pk_test_browser';

    const result = validateStripeKeyModeConsistency();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining('Production deployment')]);
  });
});
