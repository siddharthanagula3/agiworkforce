import { describe, expect, it } from 'vitest';

import {
  compareClientVersions,
  evaluateFlag,
  evaluateFlags,
  rolloutPercentage,
  type FlagSubject,
} from '../evaluate-flags';
import {
  FlagDefinitionInputSchema,
  FlagOverrideInputSchema,
  type FlagConditions,
  type FlagDefinition,
  type FlagRule,
} from '../flag-definition';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const WORKSPACE_ID = '7f1c2e4a-3b5d-4c6e-8f90-1a2b3c4d5e6f';

function subject(overrides: Partial<FlagSubject> = {}): FlagSubject {
  return {
    userId: 'user_1',
    workspaceId: WORKSPACE_ID,
    role: 'member',
    plan: 'pro',
    region: 'us',
    country: 'US',
    surface: 'web',
    clientVersion: '2.4.1',
    ...overrides,
  };
}

function definition(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    key: 'composer.new_attachments',
    description: '',
    killSwitch: false,
    variants: ['on', 'off'],
    defaultVariant: 'off',
    rules: [],
    expiresAt: null,
    archivedAt: null,
    version: 3,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function rule(overrides: Partial<FlagRule> = {}): FlagRule {
  return { id: 'everyone', conditions: {}, bucketBy: 'user', variant: 'on', ...overrides };
}

describe('flag targeting', () => {
  it('serves the default variant when no rule matches', () => {
    const evaluation = evaluateFlag(definition(), subject(), {}, NOW);
    expect(evaluation).toMatchObject({ variant: 'off', enabled: false, reason: 'default' });
  });

  it.each<[string, FlagConditions, Partial<FlagSubject>]>([
    ['workspace', { workspaceIds: [WORKSPACE_ID] }, { workspaceId: null }],
    ['role', { roles: ['admin'] }, { role: 'member' }],
    ['plan', { plans: ['max', 'enterprise'] }, { plan: 'pro' }],
    ['region', { regions: ['eu'] }, { region: 'us' }],
    ['country', { countries: ['IN'] }, { country: 'US' }],
    ['surface', { surfaces: ['desktop'] }, { surface: 'web' }],
    ['user', { userIds: ['user_2'] }, { userId: 'user_1' }],
  ])('targets by %s', (_name, conditions, miss) => {
    const flag = definition({ rules: [rule({ conditions })] });
    const matching = subject(
      Object.fromEntries(
        Object.entries(conditions).map(([key, values]) => [
          {
            workspaceIds: 'workspaceId',
            roles: 'role',
            plans: 'plan',
            regions: 'region',
            countries: 'country',
            surfaces: 'surface',
            userIds: 'userId',
          }[key]!,
          (values as readonly string[])[0],
        ]),
      ),
    );
    expect(evaluateFlag(flag, matching, {}, NOW).reason).toBe('rule');
    expect(evaluateFlag(flag, subject(miss), {}, NOW).reason).toBe('default');
  });

  it('targets by client version range and excludes a client that sends none', () => {
    const flag = definition({
      rules: [rule({ conditions: { clientVersion: { min: '2.4', max: '3' } } })],
    });
    expect(evaluateFlag(flag, subject({ clientVersion: '2.4.0' }), {}, NOW).enabled).toBe(true);
    expect(evaluateFlag(flag, subject({ clientVersion: '3.0.0' }), {}, NOW).enabled).toBe(true);
    expect(evaluateFlag(flag, subject({ clientVersion: '3.0.1' }), {}, NOW).enabled).toBe(false);
    expect(evaluateFlag(flag, subject({ clientVersion: '2.3.9' }), {}, NOW).enabled).toBe(false);
    expect(evaluateFlag(flag, subject({ clientVersion: null }), {}, NOW).enabled).toBe(false);
  });

  it('compares client versions numerically, not lexically', () => {
    expect(compareClientVersions('2.10.0', '2.9.9')).toBe(1);
    expect(compareClientVersions('2', '2.0.0')).toBe(0);
  });
});

describe('percentage rollout', () => {
  const population = Array.from({ length: 4_000 }, (_, index) => `user_${index}`);

  it('reaches close to the declared share of subjects', () => {
    const flag = definition({ rules: [rule({ rollout: { percentage: 25 } })] });
    const reached = population.filter(
      (userId) => evaluateFlag(flag, subject({ userId }), {}, NOW).enabled,
    ).length;
    expect(Math.abs(reached / population.length - 0.25)).toBeLessThan(0.03);
  });

  it('keeps every subject it already reached as the percentage grows', () => {
    const at = (percentage: number) =>
      new Set(
        population.filter(
          (userId) =>
            evaluateFlag(
              definition({ rules: [rule({ rollout: { percentage } })] }),
              subject({ userId }),
              {},
              NOW,
            ).enabled,
        ),
      );
    const ten = at(10);
    const fifty = at(50);
    expect([...ten].every((userId) => fifty.has(userId))).toBe(true);
  });

  it('does not select the same population for two flags at the same percentage', () => {
    const reachedBy = (key: string) =>
      population.filter(
        (userId) =>
          evaluateFlag(
            definition({ key, rules: [rule({ rollout: { percentage: 10 } })] }),
            subject({ userId }),
            {},
            NOW,
          ).enabled,
      );
    const first = new Set(reachedBy('flag.one'));
    const overlap = reachedBy('flag.two').filter((userId) => first.has(userId)).length;
    expect(overlap / first.size).toBeLessThan(0.3);
  });

  it('ramps linearly between its start and end', () => {
    const ramp = {
      ramp: {
        fromPercentage: 0,
        toPercentage: 100,
        startAt: '2026-09-17T10:00:00.000Z',
        endAt: '2026-09-17T14:00:00.000Z',
      },
    };
    expect(rolloutPercentage(ramp, Date.parse('2026-09-17T09:00:00.000Z'))).toBe(0);
    expect(rolloutPercentage(ramp, NOW)).toBe(50);
    expect(rolloutPercentage(ramp, Date.parse('2026-09-18T00:00:00.000Z'))).toBe(100);
  });

  it('buckets a workspace-bucketed rule by workspace, so a whole workspace moves together', () => {
    const flag = definition({
      rules: [rule({ bucketBy: 'workspace', rollout: { percentage: 50 } })],
    });
    const answers = new Set(
      ['user_a', 'user_b', 'user_c', 'user_d'].map(
        (userId) => evaluateFlag(flag, subject({ userId }), {}, NOW).enabled,
      ),
    );
    expect(answers.size).toBe(1);
    expect(evaluateFlag(flag, subject({ workspaceId: null }), {}, NOW).reason).toBe('default');
  });
});

describe('experiments', () => {
  it('splits subjects across weighted variants deterministically', () => {
    const flag = definition({
      variants: ['control', 'treatment', 'off'],
      rules: [
        rule({
          variant: undefined,
          split: [
            { variant: 'control', weight: 50 },
            { variant: 'treatment', weight: 50 },
          ],
        }),
      ],
    });
    const counts = { control: 0, treatment: 0 } as Record<string, number>;
    for (let index = 0; index < 2_000; index += 1) {
      const variant = evaluateFlag(flag, subject({ userId: `user_${index}` }), {}, NOW).variant;
      counts[variant] = (counts[variant] ?? 0) + 1;
    }
    expect(Math.abs((counts['control'] ?? 0) / 2_000 - 0.5)).toBeLessThan(0.05);
    const first = evaluateFlag(flag, subject({ userId: 'user_7' }), {}, NOW).variant;
    expect(evaluateFlag(flag, subject({ userId: 'user_7' }), {}, NOW).variant).toBe(first);
  });
});

describe('precedence', () => {
  const everyone = definition({ rules: [rule()] });

  it('lets the kill switch win over overrides and rules', () => {
    const evaluation = evaluateFlag(
      { ...everyone, killSwitch: true },
      subject(),
      {
        user: {
          flagKey: everyone.key,
          subject: 'user',
          subjectId: 'user_1',
          variant: 'on',
          expiresAt: null,
        },
      },
      NOW,
    );
    expect(evaluation).toMatchObject({ variant: 'off', enabled: false, reason: 'kill_switch' });
  });

  it('serves the default variant once the flag has expired', () => {
    const evaluation = evaluateFlag(
      { ...everyone, expiresAt: '2026-09-17T11:59:59.000Z' },
      subject(),
      {},
      NOW,
    );
    expect(evaluation).toMatchObject({ variant: 'off', reason: 'expired' });
  });

  it('prefers a user override to a workspace override, and ignores an expired one', () => {
    const flags = evaluateFlags(
      [definition()],
      subject(),
      [
        {
          flagKey: 'composer.new_attachments',
          subject: 'workspace',
          subjectId: WORKSPACE_ID,
          variant: 'on',
          expiresAt: null,
        },
        {
          flagKey: 'composer.new_attachments',
          subject: 'user',
          subjectId: 'user_1',
          variant: 'off',
          expiresAt: '2026-09-17T11:00:00.000Z',
        },
      ],
      NOW,
    );
    expect(flags['composer.new_attachments']).toMatchObject({
      variant: 'on',
      reason: 'workspace_override',
    });
  });

  it('leaves archived flags out of evaluation entirely', () => {
    expect(
      evaluateFlags([definition({ archivedAt: '2026-09-02T00:00:00.000Z' })], subject(), [], NOW),
    ).toEqual({});
  });
});

describe('definition validation', () => {
  it('requires the off variant the kill switch serves', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      key: 'composer.variants',
      variants: ['a', 'b'],
      defaultVariant: 'a',
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a rule serving an undeclared variant', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      key: 'composer.variants',
      rules: [{ id: 'arm', variant: 'purple' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a ramp that ends before it starts', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      key: 'composer.ramp',
      rules: [
        {
          id: 'ramp',
          variant: 'on',
          rollout: {
            ramp: {
              fromPercentage: 0,
              toPercentage: 100,
              startAt: '2026-09-18T00:00:00.000Z',
              endAt: '2026-09-17T00:00:00.000Z',
            },
          },
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a targeted, ramped definition with an expiry', () => {
    const parsed = FlagDefinitionInputSchema.safeParse({
      key: 'routing.canary.coding_balanced',
      expiresAt: '2026-10-01T00:00:00.000Z',
      rules: [
        {
          id: 'enterprise',
          conditions: { plans: ['enterprise'], regions: ['us'], clientVersion: { min: '2.0' } },
          rollout: { percentage: 5 },
          variant: 'on',
        },
      ],
    });
    expect(parsed.error).toBeUndefined();
  });

  it('refuses a workspace override that does not name a workspace id', () => {
    expect(
      FlagOverrideInputSchema.safeParse({
        subject: 'workspace',
        subjectId: 'user_1',
        variant: 'on',
      }).success,
    ).toBe(false);
  });
});
