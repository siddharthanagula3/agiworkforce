import { describe, expect, it } from 'vitest';

import { EXPERIMENT_CONTROL_VARIANT, type ExperimentDefinition } from '@agiworkforce/types';

import {
  FLAG_NAMESPACES,
  flagConfigProblems,
  flagNamespaceClaimingPrefix,
  isDeclaredFlagKey,
  isUnreadFlagKey,
} from '../config-schema';
import { evaluateFlag, type FlagSubject } from '../evaluate-flags';
import { FlagDefinitionInputSchema, type FlagDefinition } from '../flag-definition';
import {
  EXPERIMENT_FLAG_PREFIX,
  assignedExperiments,
  experimentFlagDefinition,
  experimentFlagKey,
  isExperimentFlagKey,
} from '../experiments';
import { findStaleFlags } from '../stale-flags';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

const COMPOSER_HINT: ExperimentDefinition = {
  hypothesis: 'A shorter composer hint raises the share of first messages that are sent.',
  owner: 'apps/web/features/chat/components/Composer',
  domain: 'chat',
  policy: null,
  population: 'Signed-in accounts on the web surface in their first session.',
  exclusions: [],
  variants: [EXPERIMENT_CONTROL_VARIANT, 'short_hint'],
  assignmentKey: 'user',
  exposureEvent: 'composer.hint_seen',
  primaryMetric: 'first message sent within the session',
  guardrails: ['message send errors'],
  startAt: '2026-09-01T00:00:00.000Z',
  endAt: '2026-12-01T00:00:00.000Z',
  result: 'pending',
  decision: 'pending',
};

function stored(input: ReturnType<typeof experimentFlagDefinition>): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function subject(userId: string): FlagSubject {
  return {
    userId,
    workspaceId: null,
    role: 'member',
    plan: 'pro',
    region: 'us-east-1',
    country: 'US',
    surface: 'web',
    clientVersion: '2.4.1',
  };
}

describe('an experiment is one flag with a split', () => {
  it('carries the registry arms and buckets by the registry subject', () => {
    const definition = experimentFlagDefinition('composer_hint', COMPOSER_HINT);
    expect(definition.key).toBe('experiment.composer_hint');
    expect(definition.defaultVariant).toBe(EXPERIMENT_CONTROL_VARIANT);
    expect(definition.variants).toEqual([EXPERIMENT_CONTROL_VARIANT, 'short_hint', 'off']);
    expect(definition.rules).toHaveLength(1);
    expect(definition.rules[0]).toMatchObject({ bucketBy: 'user' });
    expect(definition.rules[0]?.split?.map((arm) => arm.variant)).toEqual([
      EXPERIMENT_CONTROL_VARIANT,
      'short_hint',
    ]);
    expect(FlagDefinitionInputSchema.safeParse(definition).success).toBe(true);
  });

  it('keeps one subject on one arm however often it is asked', () => {
    const flag = stored(experimentFlagDefinition('composer_hint', COMPOSER_HINT));
    for (const id of ['user_a', 'user_b', 'user_c', 'user_d']) {
      const first = evaluateFlag(flag, subject(id), {}, NOW);
      const later = evaluateFlag(flag, subject(id), {}, NOW + 86_400_000);
      expect(later.variant).toBe(first.variant);
      expect(COMPOSER_HINT.variants).toContain(first.variant);
    }
  });

  it('puts everybody on control when the switch is engaged', () => {
    const flag = stored(experimentFlagDefinition('composer_hint', COMPOSER_HINT));
    const killed = evaluateFlag({ ...flag, killSwitch: true }, subject('user_a'), {}, NOW);
    expect(killed.variant).toBe('off');
    expect(assignedExperiments({ [flag.key]: killed })).toEqual([]);
  });
});

describe('the experiment namespace', () => {
  it('is declared beside the other flag namespaces with one reader', () => {
    const namespace = FLAG_NAMESPACES.find((entry) => entry.id === 'experiment');
    expect(namespace?.prefix).toBe(EXPERIMENT_FLAG_PREFIX);
    expect(namespace?.defaultVariant).toBe(EXPERIMENT_CONTROL_VARIANT);
    expect(namespace?.killSwitch).toBe(false);
    expect(flagNamespaceClaimingPrefix('experiment.anything')?.id).toBe('experiment');
  });

  it('spells only ids the registry declares, so an unregistered arm has no reader', () => {
    expect(isExperimentFlagKey('experiment.never_registered')).toBe(false);
    expect(isDeclaredFlagKey('experiment.never_registered')).toBe(false);
    expect(isUnreadFlagKey('experiment.never_registered')).toBe(true);
    expect(
      flagConfigProblems({
        key: 'experiment.never_registered',
        variants: ['control', 'off'],
        defaultVariant: 'control',
        killSwitch: false,
      }),
    ).toEqual([
      'experiment.never_registered is not a name lib/feature-flags/experiments (experimentFlagKey) spells, so no code reads it',
    ]);
  });

  it('reports an unregistered experiment flag as having nobody to read it', () => {
    const orphan: FlagDefinition = {
      key: 'experiment.never_registered',
      description: '',
      killSwitch: false,
      variants: ['control', 'off'],
      defaultVariant: 'control',
      rules: [],
      expiresAt: null,
      archivedAt: null,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(findStaleFlags([orphan], NOW)).toMatchObject([{ reason: 'no_declared_reader' }]);
  });

  it('does not treat an experiment key as a key an operator may spell freely', () => {
    expect(experimentFlagKey('composer_hint')).toBe('experiment.composer_hint');
    expect(isExperimentFlagKey('experiment.Composer_Hint')).toBe(false);
  });
});
