import { describe, expect, it } from 'vitest';

import {
  assertDatabaseEnvironmentIsolation,
  checkConfigKeys,
  defineConfigKeys,
  deployedValueViolations,
  DEPLOYED_VALUE_RULES,
  isLoopbackConnectionString,
  RUNTIME_ENVIRONMENTS,
  resolveRuntimeEnvironment,
  REMOTE_DATABASE_OVERRIDE_VALUE,
  REMOTE_DATABASE_OVERRIDE_VAR,
  type ConfigKeyDescriptor,
  type IsolationEnvironment,
} from '../environment-isolation';
import { DataLayerConfigError } from '../types';

const LOCAL_DB = 'postgresql://u:p@127.0.0.1:5432/agiworkforce_dev';
const TEST_DB = 'postgresql://test:test@127.0.0.1:1/agi_test_must_not_connect?sslmode=require';
const SHARED_DB = 'postgresql://u:p@ep-little-math-apu2yl8h-pooler.c-7.aws.neon.tech/db';

function assertIn(env: IsolationEnvironment, connectionString: string): void {
  assertDatabaseEnvironmentIsolation({ connectionString, env });
}

describe('resolveRuntimeEnvironment', () => {
  it('defaults to development when nothing declares an environment', () => {
    expect(resolveRuntimeEnvironment({})).toBe('development');
  });

  it('reads NODE_ENV when no deployment marker is present', () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'test' })).toBe('test');
  });

  it('lets the platform deployment marker win over NODE_ENV', () => {
    expect(resolveRuntimeEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(
      'preview',
    );
  });

  it('prefers the vendor-neutral AGI_DEPLOY_ENV over the platform variable', () => {
    expect(resolveRuntimeEnvironment({ AGI_DEPLOY_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(
      'production',
    );
  });

  it('ignores an environment name it does not recognise', () => {
    expect(resolveRuntimeEnvironment({ VERCEL_ENV: 'staging', NODE_ENV: 'test' })).toBe('test');
  });
});

describe('isLoopbackConnectionString', () => {
  it.each([
    'postgresql://u:p@localhost:5432/db',
    'postgresql://u:p@127.0.0.1:5432/db',
    'postgresql://u:p@127.9.9.9:5432/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u:p@db.localhost:5432/db',
  ])('accepts %s', (connectionString) => {
    expect(isLoopbackConnectionString(connectionString)).toBe(true);
  });

  it.each([
    'postgresql://u:p@ep.neon.tech/db',
    'postgresql://u:p@10.0.0.4:5432/db',
    'postgresql://u:p@localhost.attacker.example/db',
    'not-a-connection-string',
  ])('rejects %s', (connectionString) => {
    expect(isLoopbackConnectionString(connectionString)).toBe(false);
  });
});

describe('assertDatabaseEnvironmentIsolation', () => {
  it('allows development against a local database', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, LOCAL_DB)).not.toThrow();
  });

  it('allows test against a test database', () => {
    expect(() => assertIn({ NODE_ENV: 'test' }, TEST_DB)).not.toThrow();
  });

  it('allows production against a production database', () => {
    expect(() =>
      assertIn({ NODE_ENV: 'production', VERCEL_ENV: 'production' }, SHARED_DB),
    ).not.toThrow();
  });

  it('allows a preview deployment against its own remote database', () => {
    expect(() =>
      assertIn({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, SHARED_DB),
    ).not.toThrow();
  });

  it('rejects development against a production database', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, SHARED_DB)).toThrow(DataLayerConfigError);
    expect(() => assertIn({ NODE_ENV: 'development' }, SHARED_DB)).toThrow(/not a loopback/);
  });

  it('rejects test against a production database', () => {
    expect(() => assertIn({ NODE_ENV: 'test' }, SHARED_DB)).toThrow(DataLayerConfigError);
  });

  it('rejects an unset environment against a production database', () => {
    expect(() => assertIn({}, SHARED_DB)).toThrow(DataLayerConfigError);
  });

  it('names the offending host and the override in the refusal', () => {
    try {
      assertIn({ NODE_ENV: 'development' }, SHARED_DB);
      expect.unreachable('the guard should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('ep-little-math-apu2yl8h-pooler.c-7.aws.neon.tech');
      expect(message).toContain(REMOTE_DATABASE_OVERRIDE_VAR);
      expect(message).toContain(REMOTE_DATABASE_OVERRIDE_VALUE);
    }
  });

  it('honours the explicit override', () => {
    expect(() =>
      assertIn(
        {
          NODE_ENV: 'development',
          [REMOTE_DATABASE_OVERRIDE_VAR]: REMOTE_DATABASE_OVERRIDE_VALUE,
        },
        SHARED_DB,
      ),
    ).not.toThrow();
  });

  it.each(['1', 'true', 'yes', 'YES-I-AM-POINTING-A-DEVELOPMENT-RUNTIME-AT-A-SHARED-DATABASE'])(
    'refuses a reflexive override value %s',
    (value) => {
      expect(() =>
        assertIn({ NODE_ENV: 'development', [REMOTE_DATABASE_OVERRIDE_VAR]: value }, SHARED_DB),
      ).toThrow(DataLayerConfigError);
    },
  );

  it('leaves an unparseable connection string to the adapter to report', () => {
    expect(() => assertIn({ NODE_ENV: 'development' }, 'not-a-connection-string')).not.toThrow();
  });
});

describe('config key registry', () => {
  const facets = {
    type: 'string',
    owner: 'data-layer',
    defaultValue: null,
    requiredIn: [],
    description: 'a key the test declares',
    lifecycle: 'in-use',
  } as const satisfies Omit<ConfigKeyDescriptor, 'key' | 'secrecy' | 'allowedEnvironments'>;

  const registry = defineConfigKeys([
    {
      ...facets,
      key: 'STRIPE_SECRET_KEY',
      secrecy: 'secret',
      allowedEnvironments: RUNTIME_ENVIRONMENTS,
    },
    {
      ...facets,
      key: 'AGI_ALLOW_REMOTE_DATABASE',
      secrecy: 'public',
      allowedEnvironments: ['development'],
    },
    {
      ...facets,
      key: 'NEXT_PUBLIC_SESSION_SIGNING_KEY',
      secrecy: 'secret',
      allowedEnvironments: RUNTIME_ENVIRONMENTS,
    },
  ]);

  it('says nothing about a key set where it is allowed', () => {
    const violations = checkConfigKeys(registry, {
      NODE_ENV: 'development',
      STRIPE_SECRET_KEY: 'sk_test_x',
      AGI_ALLOW_REMOTE_DATABASE: 'no',
    });
    expect(violations.map((violation) => violation.key)).toEqual([
      'NEXT_PUBLIC_SESSION_SIGNING_KEY',
    ]);
  });

  it('names a key set in an environment it is not allowed in', () => {
    const violations = checkConfigKeys(registry, {
      NODE_ENV: 'production',
      AGI_ALLOW_REMOTE_DATABASE: 'yes',
    });
    expect(violations).toContainEqual(
      expect.objectContaining({
        key: 'AGI_ALLOW_REMOTE_DATABASE',
        environment: 'production',
        reason: 'environment_not_allowed',
      }),
    );
  });

  it('refuses a secret whose name ships it to the browser, set or not', () => {
    const violations = checkConfigKeys(registry, { NODE_ENV: 'production' });
    expect(violations).toEqual([
      expect.objectContaining({
        key: 'NEXT_PUBLIC_SESSION_SIGNING_KEY',
        reason: 'secret_exposed_to_client',
      }),
    ]);
  });

  it('ignores a key nothing registered', () => {
    expect(
      checkConfigKeys(defineConfigKeys([]), { NODE_ENV: 'test', SOMETHING_ELSE: 'x' }),
    ).toEqual([]);
  });

  it('names a required key nothing set, and says so only where it is required', () => {
    const required = defineConfigKeys([
      {
        ...facets,
        key: 'CRON_SECRET',
        secrecy: 'secret',
        allowedEnvironments: RUNTIME_ENVIRONMENTS,
        requiredIn: ['production'],
      },
    ]);
    expect(checkConfigKeys(required, { NODE_ENV: 'production' })).toContainEqual(
      expect.objectContaining({ key: 'CRON_SECRET', reason: 'required_and_unset' }),
    );
    expect(checkConfigKeys(required, { NODE_ENV: 'development' })).toEqual([]);
  });

  it('accepts a required key that has a safe default', () => {
    const withDefault = defineConfigKeys([
      {
        ...facets,
        key: 'LOG_LEVEL',
        secrecy: 'public',
        allowedEnvironments: RUNTIME_ENVIRONMENTS,
        requiredIn: ['production'],
        defaultValue: 'info',
      },
    ]);
    expect(checkConfigKeys(withDefault, { NODE_ENV: 'production' })).toEqual([]);
  });

  it('runs the declared validation over a set value', () => {
    const validated = defineConfigKeys([
      {
        ...facets,
        key: 'NEXT_PUBLIC_APP_URL',
        secrecy: 'public',
        allowedEnvironments: RUNTIME_ENVIRONMENTS,
        validate: (value) => (value.startsWith('https://') ? null : 'it is not https'),
      },
    ]);
    expect(
      checkConfigKeys(validated, { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'ftp://x' }),
    ).toContainEqual(expect.objectContaining({ reason: 'invalid_value' }));
    expect(
      checkConfigKeys(validated, { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://x.dev' }),
    ).toEqual([]);
  });

  it('names a deprecated key that is still set, and refuses one with no successor', () => {
    const deprecated = defineConfigKeys([
      {
        ...facets,
        key: 'OLD_DATABASE_URL',
        secrecy: 'secret',
        allowedEnvironments: RUNTIME_ENVIRONMENTS,
        lifecycle: 'deprecated',
        supersededBy: 'AGI_DATABASE_URL',
      },
    ]);
    expect(
      checkConfigKeys(deprecated, { NODE_ENV: 'production', OLD_DATABASE_URL: 'postgres://x' }),
    ).toContainEqual(expect.objectContaining({ reason: 'deprecated_and_set' }));

    const orphan = defineConfigKeys([
      {
        ...facets,
        key: 'OLD_DATABASE_URL',
        secrecy: 'secret',
        allowedEnvironments: RUNTIME_ENVIRONMENTS,
        lifecycle: 'deprecated',
      },
    ]);
    expect(checkConfigKeys(orphan, { NODE_ENV: 'production' })).toContainEqual(
      expect.objectContaining({ reason: 'descriptor_incomplete' }),
    );
  });

  it('refuses a descriptor that describes nothing, owns nothing or defaults a secret', () => {
    const incomplete = defineConfigKeys([
      {
        ...facets,
        key: 'A',
        secrecy: 'public',
        allowedEnvironments: ['production'],
        description: ' ',
      },
      { ...facets, key: 'B', secrecy: 'public', allowedEnvironments: ['production'], owner: '' },
      {
        ...facets,
        key: 'C',
        secrecy: 'secret',
        allowedEnvironments: ['production'],
        defaultValue: 'hunter2',
      },
      {
        ...facets,
        key: 'D',
        secrecy: 'public',
        allowedEnvironments: ['development'],
        requiredIn: ['production'],
      },
    ]);
    const reasons = checkConfigKeys(incomplete, { NODE_ENV: 'production' }).filter(
      (violation) => violation.reason === 'descriptor_incomplete',
    );
    expect(reasons.map((violation) => violation.key).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('deployedValueViolations', () => {
  const registry = defineConfigKeys([
    {
      key: 'STRIPE_SECRET_KEY',
      secrecy: 'secret',
      allowedEnvironments: RUNTIME_ENVIRONMENTS,
      type: 'string',
      owner: 'billing',
      defaultValue: null,
      requiredIn: [],
      description: 'the billing credential',
      lifecycle: 'in-use',
    },
    {
      key: 'NEXT_PUBLIC_APP_URL',
      secrecy: 'public',
      allowedEnvironments: RUNTIME_ENVIRONMENTS,
      type: 'url',
      owner: 'apps/web',
      defaultValue: null,
      requiredIn: [],
      description: 'the origin this deployment serves',
      lifecycle: 'in-use',
    },
  ]);

  const cases: Array<[string, IsolationEnvironment, string]> = [
    [
      'a test credential in production',
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0001' },
      'test_credential',
    ],
    [
      'a restricted test credential in production',
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'rk_test_FAKEFAKEFAKE0001' },
      'test_credential',
    ],
    [
      'a live credential in preview',
      { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_live_FAKEFAKEFAKE0001' },
      'live_credential',
    ],
    [
      'a loopback origin in production',
      { VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
      'loopback_url',
    ],
    [
      'a loopback origin in preview',
      { VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000' },
      'loopback_url',
    ],
    [
      'a placeholder secret in production',
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'changeme' },
      'placeholder',
    ],
    [
      'a your-value placeholder in preview',
      { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'your-secret-here' },
      'placeholder',
    ],
    [
      'a repeated character placeholder in production',
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'xxxxxxxxxx' },
      'placeholder',
    ],
  ];

  it.each(cases)('refuses %s', (_name, env, rule) => {
    const violations = deployedValueViolations(registry, env);
    expect(violations.map((violation) => violation.rule)).toContain(rule);
  });

  it('says nothing about the values each environment is entitled to', () => {
    expect(
      deployedValueViolations(registry, {
        VERCEL_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_live_FAKEFAKEFAKE0001',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      }),
    ).toEqual([]);
    expect(
      deployedValueViolations(registry, {
        VERCEL_ENV: 'preview',
        STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0001',
        NEXT_PUBLIC_APP_URL: 'https://preview.example.com',
      }),
    ).toEqual([]);
  });

  it('leaves a development runtime alone, which is where those values belong', () => {
    expect(
      deployedValueViolations(registry, {
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0001',
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
      }),
    ).toEqual([]);
  });

  it('every rule names the environments it applies to and what it costs', () => {
    for (const [name, rule] of Object.entries(DEPLOYED_VALUE_RULES)) {
      expect(rule.refusedIn.length, name).toBeGreaterThan(0);
      expect(rule.consequence.length, name).toBeGreaterThan(20);
    }
  });
});
