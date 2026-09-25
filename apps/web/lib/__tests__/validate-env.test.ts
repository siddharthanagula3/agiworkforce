import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../price-tier-mapping', () => ({
  getAllRegisteredPriceIds: vi.fn(() => []),
}));

vi.mock('../pricing', () => ({
  STRIPE_PRICE_IDS: {},
}));

const mockRecordConfigurationState = vi.fn();
vi.mock('../observability/metrics', () => ({
  recordConfigurationState: (input: unknown) => mockRecordConfigurationState(input),
}));

import {
  configKeyRegistry,
  validateConfigKeyRegistry,
  validateDeployedValues,
  validateOAuthCallbackIsolation,
  validateRequiredEnvVars,
} from '../validate-env';

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

  it('rejects a present but invalid TOTP encryption key before serving requests', () => {
    process.env['AGI_PLATFORM_KEY_PROVIDER'] = 'env';
    process.env['TOTP_ENCRYPTION_KEY'] = 'present-but-only-48-bytes-long-xxxxxxxxxxxxxxxx';

    const result = validateRequiredEnvVars();

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/TOTP_ENCRYPTION_KEY too short/i)]),
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

  it('refuses the boot when Clerk pk_test_ keys run in a production deployment', () => {
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';
    process.env['VERCEL_ENV'] = 'production';
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_aGFuZHktdGVzdA';
    const result = validateProductionKeyTypes();
    const failure = result.errors.find((x) => x.includes('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
    expect(failure).toBeDefined();
    expect(failure).toContain('pk_test_');
    expect(result.valid).toBe(false);
  });

  it('refuses a production runtime that carries no platform deployment marker', () => {
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';
    delete process.env['VERCEL_ENV'];
    delete process.env['AGI_DEPLOY_ENV'];
    vi.stubEnv('NODE_ENV', 'production');
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_aGFuZHk';
    expect(validateProductionKeyTypes().valid).toBe(false);
    vi.unstubAllEnvs();
  });

  it('is silent for pk_live_ keys in production', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_live_aGFuZHktbGl2ZQ';
    process.env['CLERK_SECRET_KEY'] = 'sk_live_abc';
    expect(validateProductionKeyTypes().errors).toHaveLength(0);
  });

  it('is silent for pk_test_ keys OUTSIDE production (local dev / preview)', () => {
    delete process.env['VERCEL_ENV'];
    process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_aGFuZHk';
    expect(validateProductionKeyTypes().errors).toHaveLength(0);
  });
});

describe('a deployed runtime refuses a value that belongs to another environment', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const key of ['VERCEL_ENV', 'AGI_DEPLOY_ENV']) delete process.env[key];
    for (const key of Object.keys(configKeyRegistry())) delete process.env[key];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  const bad: Array<[string, string, string, string]> = [
    ['production', 'STRIPE_SECRET_KEY', 'sk_test_FAKEFAKEFAKE0001', 'test credential'],
    ['production', 'STRIPE_SECRET_KEY', 'rk_test_FAKEFAKEFAKE0001', 'test credential'],
    ['production', 'STRIPE_SECRET_KEY', 'changeme', 'placeholder'],
    ['production', 'STRIPE_SECRET_KEY', 'your-secret-here', 'placeholder'],
    ['production', 'NEXT_PUBLIC_APP_URL', 'http://localhost:3000', 'loopback url'],
    ['preview', 'STRIPE_SECRET_KEY', 'sk_live_FAKEFAKEFAKE0001', 'live credential'],
    ['preview', 'NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000', 'loopback url'],
    ['preview', 'STRIPE_SECRET_KEY', 'placeholder', 'placeholder'],
  ];

  it.each(bad)('refuses %s booting on %s=%s', (environment, key, value, rule) => {
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';
    process.env['VERCEL_ENV'] = environment;
    process.env[key] = value;
    const result = validateDeployedValues();
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(rule);
    expect(result.errors.join(' ')).toContain(key);
  });

  it('accepts the values each deployed environment is entitled to', () => {
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_FAKEFAKEFAKE0001';
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com';
    expect(validateDeployedValues()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('warns and boots when the switch is unset, so no branch can take production down', () => {
    delete process.env['AGI_ENFORCE_PRODUCTION_CONFIG'];
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_FAKEFAKEFAKE0001';

    const result = validateDeployedValues();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(' ')).toContain('STRIPE_SECRET_KEY');
  });

  it('is loud about a deployed value finding in both positions of the switch', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env['AGI_ENFORCE_PRODUCTION_CONFIG'];
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_FAKEFAKEFAKE0001';

    validateDeployedValues();

    expect(consoleError.mock.calls.flat().join(' ')).toContain('[production-config]');
    consoleError.mockRestore();
  });

  it('leaves a development runtime alone, which is where a test key belongs', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_FAKEFAKEFAKE0001';
    process.env['NEXT_PUBLIC_APP_URL'] = 'http://127.0.0.1:3000';
    expect(validateDeployedValues().errors).toEqual([]);
  });
});

describe('every configuration key declares all ten facets', () => {
  it('names itself, its type, its owner, its default, when it is required and what it is', () => {
    const descriptors = Object.values(configKeyRegistry());
    expect(descriptors.length).toBeGreaterThan(15);
    for (const descriptor of descriptors) {
      expect(descriptor.key, 'key').toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(['string', 'url', 'integer', 'boolean', 'enum']).toContain(descriptor.type);
      expect(descriptor.owner.length, descriptor.key).toBeGreaterThan(0);
      expect(descriptor.defaultValue === null || typeof descriptor.defaultValue === 'string').toBe(
        true,
      );
      expect(Array.isArray(descriptor.requiredIn), descriptor.key).toBe(true);
      expect(['secret', 'public']).toContain(descriptor.secrecy);
      expect(descriptor.allowedEnvironments.length, descriptor.key).toBeGreaterThan(0);
      expect(descriptor.description.length, descriptor.key).toBeGreaterThan(20);
      expect(['in-use', 'deprecated']).toContain(descriptor.lifecycle);
      if (descriptor.lifecycle === 'deprecated') expect(descriptor.supersededBy).toBeTruthy();
    }
  });

  it('declares a validation for every key whose type constrains its value', () => {
    for (const descriptor of Object.values(configKeyRegistry())) {
      if (descriptor.type === 'string') continue;
      expect(typeof descriptor.validate, descriptor.key).toBe('function');
    }
  });

  it('gives no secret a default value, because a default secret is a shared secret', () => {
    for (const descriptor of Object.values(configKeyRegistry())) {
      if (descriptor.secrecy !== 'secret') continue;
      expect(descriptor.defaultValue, descriptor.key).toBeNull();
    }
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

import { validateSecurityEscapeHatches } from '../validate-env';

describe('validateSecurityEscapeHatches · ACCOUNT_STATUS_FAIL_OPEN', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['ACCOUNT_STATUS_FAIL_OPEN'];
    delete process.env['VERCEL_ENV'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('says nothing when the hatch is unset, the default is fail-closed', () => {
    expect(validateSecurityEscapeHatches()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('says nothing when the hatch is present but off', () => {
    process.env['ACCOUNT_STATUS_FAIL_OPEN'] = '0';
    process.env['VERCEL_ENV'] = 'production';

    expect(validateSecurityEscapeHatches()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('fails the production boot check when the hatch is on', () => {
    process.env['ACCOUNT_STATUS_FAIL_OPEN'] = 'true';
    process.env['VERCEL_ENV'] = 'production';

    const result = validateSecurityEscapeHatches();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining('suspended and banned accounts keep working'),
    ]);
  });

  it('only warns outside production, so a developer can still turn it on locally', () => {
    process.env['ACCOUNT_STATUS_FAIL_OPEN'] = 'on';

    const result = validateSecurityEscapeHatches();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining('ACCOUNT_STATUS_FAIL_OPEN')]);
  });
});

describe('validateSecurityEscapeHatches · AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY'];
    delete process.env['ACCOUNT_STATUS_FAIL_OPEN'];
    delete process.env['VERCEL_ENV'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('says nothing when the policy is unset or explicitly fail-closed', () => {
    process.env['VERCEL_ENV'] = 'production';
    expect(validateSecurityEscapeHatches()).toEqual({ valid: true, errors: [], warnings: [] });

    process.env['AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY'] = 'fail-closed';
    expect(validateSecurityEscapeHatches()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('fails the production boot check when rate limiting is set to fail open', () => {
    process.env['AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY'] = 'Fail-Open';
    process.env['VERCEL_ENV'] = 'production';

    const result = validateSecurityEscapeHatches();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining('AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY is set to fail-open'),
    ]);
  });

  it('only warns outside production, where fail-open is already the default', () => {
    process.env['AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY'] = 'fail-open';

    const result = validateSecurityEscapeHatches();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.stringContaining('AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY'),
    ]);
  });
});

import { validateEnvironment } from '../validate-env';

describe('validateEnvironment · generated media storage reaches the boot check', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
    process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access-key';
    process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret-key';
    process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'media-public';
    delete process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('warns at boot when the private bucket is missing, so billed generations cannot fail silently', () => {
    const result = validateEnvironment();

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME is not set'),
      ]),
    );
  });

  it('warns at boot when the private bucket duplicates the public one', () => {
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'media-public';

    const result = validateEnvironment();

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME matches'),
      ]),
    );
  });

  it('is silent once a distinct private bucket is configured', () => {
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'media-private';

    const result = validateEnvironment();

    expect(
      result.warnings.filter((warning) => warning.includes('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME')),
    ).toEqual([]);
  });
});

import { validateEmailPseudonymPepper } from '../validate-env';

describe('validateEmailPseudonymPepper · boot check', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['EMAIL_HASH_PEPPER'];
    delete process.env['VERCEL_ENV'];
    delete process.env['NEXT_PHASE'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('fails the boot check in production when the pepper is missing', () => {
    process.env['VERCEL_ENV'] = 'production';

    const result = validateEmailPseudonymPepper();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining('EMAIL_HASH_PEPPER is not set')]);
  });

  it('only warns outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const result = validateEmailPseudonymPepper();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining('EMAIL_HASH_PEPPER is not set')]);
  });

  it('is silent once the pepper is set', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['EMAIL_HASH_PEPPER'] = 'a'.repeat(64);

    const result = validateEmailPseudonymPepper();

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('reaches the boot aggregate', () => {
    process.env['VERCEL_ENV'] = 'production';

    const result = validateEnvironment();

    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('EMAIL_HASH_PEPPER is not set')]),
    );
  });
});

import { validateSandboxOriginConfigured } from '../validate-env';

describe('validateSandboxOriginConfigured · boot check', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    delete process.env['VERCEL_ENV'];
    delete process.env['NEXT_PHASE'];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('warns, but never fails the boot check, when unset in production', () => {
    process.env['VERCEL_ENV'] = 'production';

    const result = validateSandboxOriginConfigured();

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining('NEXT_PUBLIC_SANDBOX_ORIGIN is not set'),
    ]);
    expect(result.warnings[0]).toContain('This is a production runtime');
  });

  it('warns without the production callout outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const result = validateSandboxOriginConfigured();

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.stringContaining('NEXT_PUBLIC_SANDBOX_ORIGIN is not set'),
    ]);
    expect(result.warnings[0]).not.toContain('production runtime');
  });

  it('is silent once the sandbox origin is set', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';

    const result = validateSandboxOriginConfigured();

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('reaches the boot aggregate', () => {
    process.env['VERCEL_ENV'] = 'production';

    const result = validateEnvironment();

    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('NEXT_PUBLIC_SANDBOX_ORIGIN is not set')]),
    );
  });
});

describe('OAuth callback isolation and the config key registry', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['AGI_DEPLOY_ENV'];
    delete process.env['VERCEL_ENV'];
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('warns when a development runtime sends OAuth callbacks to a shared host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.agiworkforce.com';

    expect(validateOAuthCallbackIsolation().warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('app.agiworkforce.com')]),
    );
  });

  it('accepts a loopback callback in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'http://127.0.0.1:3000';

    expect(validateOAuthCallbackIsolation()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('refuses a deployed callback that points at another deployment', () => {
    process.env['AGI_DEPLOY_ENV'] = 'production';
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com';
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://preview.example.com';

    const result = validateOAuthCallbackIsolation();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('preview.example.com');
  });

  it('refuses a deployed callback that is not https', () => {
    process.env['AGI_DEPLOY_ENV'] = 'production';
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'http://app.example.com';

    expect(validateOAuthCallbackIsolation().errors[0]).toContain('must use https');
  });

  it('warns when a key allowed only in a deployed environment is set locally', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env['AGI_DEPLOY_ENV'] = 'development';
    process.env['VERCEL_ENV'] = 'production';

    expect(validateConfigKeyRegistry().warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('VERCEL_ENV')]),
    );
  });

  it('registers no secret under a name the bundler ships to the browser', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(validateConfigKeyRegistry().errors).toEqual([]);
  });

  it('refuses a local boot on a value this runtime does not recognise', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env['AGI_DEPLOY_ENV'] = 'development';
    process.env['LLM_TTFT_SLO_TARGET_MS'] = 'soon';

    const result = validateConfigKeyRegistry();

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('LLM_TTFT_SLO_TARGET_MS');
  });

  it('warns rather than refusing the same value in a deployed runtime', () => {
    delete process.env['AGI_ENFORCE_PRODUCTION_CONFIG'];
    process.env['AGI_DEPLOY_ENV'] = 'production';
    process.env['LLM_TTFT_SLO_TARGET_MS'] = 'soon';

    const result = validateConfigKeyRegistry();

    expect(result.errors.join(' ')).not.toContain('LLM_TTFT_SLO_TARGET_MS');
    expect(result.warnings.join(' ')).toContain('LLM_TTFT_SLO_TARGET_MS');
  });

  it('refuses the deployed boot on that value once the switch is on', () => {
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';
    process.env['AGI_DEPLOY_ENV'] = 'production';
    process.env['LLM_TTFT_SLO_TARGET_MS'] = 'soon';

    const result = validateConfigKeyRegistry();

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('LLM_TTFT_SLO_TARGET_MS');
  });

  // Registering a key adds it to the boot check. A key a deployment must set is
  // a key whose absence refuses the boot, so the set of them is a ratchet.
  it('demands a value from a deployment for these keys and no others', () => {
    const required = Object.values(configKeyRegistry())
      .filter((descriptor) => descriptor.requiredIn.length > 0)
      .map((descriptor) => descriptor.key)
      .sort();

    expect(required).toEqual(
      [
        'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND',
        'CLERK_SECRET_KEY',
        'CRON_SECRET',
        'CSRF_SECRET',
        'EMAIL_HASH_PEPPER',
        'IP_HASH_PEPPER',
        'LOG_SALT',
        'NEXT_PUBLIC_APP_URL',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'TOTP_ENCRYPTION_KEY',
      ].sort(),
    );
  });
});

describe('every encryption key the environment contract demands is one a module reads', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
  const CONTRACT = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'validate-env.ts');
  const KEY_PATTERN = /[A-Z0-9_]*ENCRYPTION_KEY/g;

  function declaredEncryptionKeys(): string[] {
    return [...new Set(readFileSync(CONTRACT, 'utf8').match(KEY_PATTERN) ?? [])];
  }

  // Product code only. A build script naming a key declares a deployment
  // requirement; it does not decrypt anything with it.
  function productSources(): string[] {
    return execFileSync(
      'git',
      ['grep', '-l', '-F', 'ENCRYPTION_KEY', '--', 'apps', 'packages', 'services'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      },
    )
      .split('\n')
      .filter(
        (file) =>
          /\.(ts|tsx|mts|cts|mjs|cjs|js|rs)$/.test(file) &&
          !file.includes('__tests__/') &&
          !/\.(test|spec)\.[a-z]+$/.test(file) &&
          file !== 'apps/web/lib/validate-env.ts' &&
          existsSync(path.join(REPO_ROOT, file)),
      );
  }

  it('demands no key that nothing in the product reads', () => {
    const declared = declaredEncryptionKeys();
    expect(declared.length).toBeGreaterThan(0);

    const read = new Set<string>();
    for (const file of productSources()) {
      for (const key of readFileSync(path.join(REPO_ROOT, file), 'utf8').match(KEY_PATTERN) ?? []) {
        read.add(key);
      }
    }

    expect(declared.filter((key) => !read.has(key))).toEqual([]);
  });
});

describe('the production config switch decides the boot, never the loudness', () => {
  let savedEnv: NodeJS.ProcessEnv;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const key of ['VERCEL_ENV', 'AGI_DEPLOY_ENV']) delete process.env[key];
    for (const key of Object.keys(configKeyRegistry())) delete process.env[key];
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRecordConfigurationState.mockClear();
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllEnvs();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  /** A production deployment holding a Stripe test key and a placeholder secret. */
  function productionOnTestKeys(): void {
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_FAKEFAKEFAKE0001';
    process.env['CRON_SECRET'] = 'changeme';
  }

  it('warns and boots when the switch is unset, so a first deploy cannot take the site down', () => {
    productionOnTestKeys();

    const result = validateEnvironment();

    expect(result.errors.join(' '), 'no production value finding may stop the boot').not.toContain(
      'sk_test_',
    );
    expect(result.warnings.join(' ')).toContain('STRIPE_SECRET_KEY');
    expect(result.warnings.join(' ')).toContain('AGI_ENFORCE_PRODUCTION_CONFIG is not 1');
  });

  it('refuses the boot when the switch is 1', () => {
    productionOnTestKeys();
    process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = '1';

    const result = validateEnvironment();

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('STRIPE_SECRET_KEY');
  });

  it('is loud in both positions: a console line per finding and an invalid configuration state', () => {
    for (const enforcement of [undefined, '1']) {
      consoleError.mockClear();
      mockRecordConfigurationState.mockClear();
      productionOnTestKeys();
      if (enforcement) process.env['AGI_ENFORCE_PRODUCTION_CONFIG'] = enforcement;
      else delete process.env['AGI_ENFORCE_PRODUCTION_CONFIG'];

      validateEnvironment();

      const said = consoleError.mock.calls.flat().join(' ');
      expect(said, `switch=${String(enforcement)}`).toContain('[production-config]');
      expect(said).toContain('STRIPE_SECRET_KEY');
      expect(mockRecordConfigurationState).toHaveBeenCalledWith({
        component: 'environment-production-values',
        state: 'invalid',
      });
    }
  });

  it('says nothing and records nothing when the deployment holds the right values', () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_FAKEFAKEFAKE0001';
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com';

    validateEnvironment();

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('[production-config]');
    expect(mockRecordConfigurationState).not.toHaveBeenCalled();
  });

  it('registers the switch as a deployed-only key with no default', () => {
    const descriptor = configKeyRegistry()['AGI_ENFORCE_PRODUCTION_CONFIG'];
    expect(descriptor).toBeDefined();
    expect(descriptor?.defaultValue).toBeNull();
    expect(descriptor?.allowedEnvironments).toEqual(['preview', 'production']);
    expect(descriptor?.owner).toBe('infrastructure');
  });

  it('is offered in the environment example, commented out and explained', () => {
    const example = readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    expect(example).toContain('# AGI_ENFORCE_PRODUCTION_CONFIG=1');
    expect(example).toMatch(/Set it to 1 once production is confirmed to hold live keys/);
  });
});
