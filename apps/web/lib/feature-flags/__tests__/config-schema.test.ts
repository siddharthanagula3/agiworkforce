import { describe, expect, it } from 'vitest';

import {
  FLAG_NAMESPACES,
  FlagNamespaceSchema,
  flagConfigProblems,
  flagNamespaceFor,
  isDeclaredFlagKey,
  isUnreadFlagKey,
} from '../config-schema';
import { FLAG_OFF_VARIANT, FLAG_ON_VARIANT } from '../flag-definition';
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  TENANT_LOCKDOWN_FLAG_KEY,
  capabilityKillSwitchKey,
  modelKillSwitchKey,
  providerKillSwitchKey,
} from '../kill-switches';
import { rolloutRingKey } from '../rollout-rings';
import { ROUTING_FLAG_KEYS, canaryCohortFlagKey } from '../routing-flags';

const GATE = [FLAG_ON_VARIANT, FLAG_OFF_VARIANT];

function definition(key: string, patch: Record<string, unknown> = {}) {
  return {
    key,
    variants: GATE,
    defaultVariant: FLAG_ON_VARIANT,
    killSwitch: true,
    ...patch,
  } as Parameters<typeof flagConfigProblems>[0];
}

describe('flag namespace schema', () => {
  it('refuses a namespace whose default variant it does not serve', () => {
    const parsed = FlagNamespaceSchema.safeParse({
      id: 'routing',
      prefix: 'routing.',
      reader: 'nowhere',
      variants: GATE,
      defaultVariant: 'treatment',
      killSwitch: false,
      keys: null,
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a closed key that does not carry its namespace prefix', () => {
    const parsed = FlagNamespaceSchema.safeParse({
      id: 'tenant',
      prefix: TENANT_LOCKDOWN_FLAG_KEY,
      reader: 'nowhere',
      variants: GATE,
      defaultVariant: FLAG_OFF_VARIANT,
      killSwitch: true,
      keys: ['capability.work'],
    });

    expect(parsed.success).toBe(false);
  });

  it('gives every namespace a distinct id', () => {
    const ids = FLAG_NAMESPACES.map((namespace) => namespace.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('which keys a reader spells', () => {
  it('declares every key the kill switch, ring and routing helpers produce', () => {
    const keys = [
      ...ALL_KILL_SWITCH_CAPABILITIES.map(capabilityKillSwitchKey),
      modelKillSwitchKey('acme/widget-1.5'),
      providerKillSwitchKey('Acme Hosting'),
      rolloutRingKey('mobile', 'beta', 'wave_one'),
      ROUTING_FLAG_KEYS.canary,
      canaryCohortFlagKey('chat_default'),
      TENANT_LOCKDOWN_FLAG_KEY,
    ];

    for (const key of keys) {
      expect(isDeclaredFlagKey(key), key).toBe(true);
      expect(isUnreadFlagKey(key), key).toBe(false);
    }
  });

  it('calls a key under a reserved prefix that no helper produces unread', () => {
    expect(isUnreadFlagKey('capability.browser')).toBe(true);
    expect(isUnreadFlagKey('rollout.new_picker')).toBe(true);
    expect(isUnreadFlagKey('model.Has Spaces')).toBe(true);
  });

  it('leaves a product flag outside every reserved prefix alone', () => {
    expect(flagNamespaceFor('composer.voice_mode')).toBeNull();
    expect(isUnreadFlagKey('composer.voice_mode')).toBe(false);
    expect(flagConfigProblems(definition('composer.voice_mode', { killSwitch: false }))).toEqual(
      [],
    );
  });
});

describe('what a stored definition contradicts', () => {
  it('accepts a definition that matches its namespace', () => {
    expect(flagConfigProblems(definition(capabilityKillSwitchKey('work')))).toEqual([]);
  });

  it('names the reader when the key is under a reserved prefix but unread', () => {
    const problems = flagConfigProblems(definition('capability.browser'));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no code reads it');
  });

  it('names a variant set the namespace does not serve', () => {
    const problems = flagConfigProblems(
      definition(rolloutRingKey('web', 'beta', 'wave_one'), {
        variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT, 'treatment'],
        defaultVariant: FLAG_OFF_VARIANT,
        killSwitch: false,
      }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('treatment');
  });

  it('names a default the reader would read as the unconfigured state', () => {
    const problems = flagConfigProblems(
      definition(rolloutRingKey('web', 'beta', 'wave_two'), {
        defaultVariant: FLAG_ON_VARIANT,
        killSwitch: false,
      }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('rollout-rings');
  });

  it('names a kill switch marked on a namespace that is not a gate', () => {
    const problems = flagConfigProblems(
      definition(ROUTING_FLAG_KEYS.shadow, { defaultVariant: FLAG_OFF_VARIANT }),
    );

    expect(problems).toEqual([expect.stringContaining('not gates')]);
  });
});
