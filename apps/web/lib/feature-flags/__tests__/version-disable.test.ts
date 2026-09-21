import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/denials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/denials')>()),
  recordCapabilityDenial: vi.fn(),
}));

const store = vi.hoisted(() => ({ definitions: [] as unknown[] }));

vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/data-region')>()),
  managedCloudDataRegion: () => 'us-east-1',
}));
vi.mock('../flag-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../flag-store')>()),
  getActiveFlagDefinitions: async () => store.definitions,
  getSubjectOverrides: async () => [],
}));

import { assertCapabilityAvailable, readKillSwitchGate } from '../capability-gate';
import type { FlagSubject } from '../evaluate-flags';
import type { FlagDefinition } from '../flag-definition';
import { COMPUTER_USE_CAPABILITY, capabilityKillSwitchKey } from '../kill-switches';
import { findStaleFlags, archivableStaleFlags } from '../stale-flags';
import {
  versionDisableBlockers,
  versionDisableDefinition,
  versionDisableIncident,
  versionDisableReason,
  withVersionDisable,
  withoutVersionDisable,
  type FeatureVersionDisable,
} from '../version-disable';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const LONG_AFTER = NOW + 200 * 86_400_000;

const BROKEN_DESKTOP: FeatureVersionDisable = {
  capability: COMPUTER_USE_CAPABILITY,
  surfaces: ['desktop'],
  minVersion: '2.4.0',
  maxVersion: '2.4.9',
  reason: 'Builds 2.4.0 to 2.4.9 could click the wrong window. Update the app to get it back.',
  incident: 'INC-1042',
};

function stored(input: ReturnType<typeof versionDisableDefinition>): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function subject(patch: Partial<FlagSubject> = {}): FlagSubject {
  return {
    userId: 'user_1',
    workspaceId: null,
    role: 'member',
    plan: 'pro',
    region: 'us-east-1',
    country: 'US',
    surface: 'desktop',
    clientVersion: '2.4.3',
    ...patch,
  };
}

beforeEach(() => {
  store.definitions = [];
});

describe('disabling a broken build from the server', () => {
  it('closes the capability for the broken range only', async () => {
    store.definitions = [stored(versionDisableDefinition(BROKEN_DESKTOP))];

    const broken = await readKillSwitchGate(subject({ clientVersion: '2.4.3' }), NOW);
    expect(broken.capabilityAllowed(COMPUTER_USE_CAPABILITY)).toBe(false);

    for (const patch of [
      { clientVersion: '2.5.0' },
      { clientVersion: '2.3.9' },
      { surface: 'web' },
    ]) {
      const untouched = await readKillSwitchGate(subject(patch), NOW);
      expect(untouched.capabilityAllowed(COMPUTER_USE_CAPABILITY)).toBe(true);
    }
  });

  it('refuses the old build with a sentence naming what happened and the incident', async () => {
    store.definitions = [stored(versionDisableDefinition(BROKEN_DESKTOP))];

    await expect(
      assertCapabilityAvailable(subject(), COMPUTER_USE_CAPABILITY, 'Computer use', NOW),
    ).rejects.toThrow(/could click the wrong window[\s\S]*Update the app[\s\S]*INC-1042/);
  });

  it('says nothing about an incident when the switch was closed for another reason', async () => {
    store.definitions = [
      stored({
        ...versionDisableDefinition(BROKEN_DESKTOP),
        description: 'Open unless the computer use capability is switched off.',
      }),
    ];

    await expect(
      assertCapabilityAvailable(subject(), COMPUTER_USE_CAPABILITY, 'Computer use', NOW),
    ).rejects.toThrow(/temporarily switched off while we investigate/);
  });

  it('reaches every surface through the one evaluator, so no client release is needed', () => {
    const definition = versionDisableDefinition(BROKEN_DESKTOP);
    expect(definition.key).toBe(capabilityKillSwitchKey(COMPUTER_USE_CAPABILITY));
    expect(definition.defaultVariant).toBe('on');
    expect(versionDisableIncident(definition.description)).toBe('INC-1042');
  });

  it('refuses a disable that would close every build or name no incident', () => {
    expect(
      versionDisableBlockers({ ...BROKEN_DESKTOP, minVersion: null, maxVersion: null }),
    ).toContain(
      'A disable with no version range closes the capability for every build, which is the ' +
        'global switch rather than this one',
    );
    expect(versionDisableBlockers({ ...BROKEN_DESKTOP, incident: '' })).toContain(
      'A disable carries the incident reference support will be asked for',
    );
    expect(versionDisableBlockers({ ...BROKEN_DESKTOP, reason: 'broken' })).toContain(
      'The reason is said back to the person who hits the gate, so it is a sentence',
    );
    expect(versionDisableBlockers(BROKEN_DESKTOP)).toEqual([]);
  });

  it('adds a second incident without reopening the first', () => {
    const first = stored(versionDisableDefinition(BROKEN_DESKTOP));
    const second = withVersionDisable(first, {
      ...BROKEN_DESKTOP,
      surfaces: ['mobile'],
      minVersion: '3.0.0',
      maxVersion: '3.0.4',
      reason: 'Builds 3.0.0 to 3.0.4 crash on the first screenshot. Update the app.',
      incident: 'INC-1077',
    });
    expect(second.rules).toHaveLength(2);
    expect(second.rules.map((rule) => rule.id)).toEqual(['disabled-inc-1042', 'disabled-inc-1077']);

    const cleared = withoutVersionDisable(stored(second), 'INC-1042');
    expect(cleared?.rules.map((rule) => rule.id)).toEqual(['disabled-inc-1077']);
    expect(withoutVersionDisable(stored(second), 'INC-9999')).toBeNull();
  });

  it('reads the reason back only from a switch that is holding a range off', () => {
    const definitions = [stored(versionDisableDefinition(BROKEN_DESKTOP))];
    expect(versionDisableReason(definitions, COMPUTER_USE_CAPABILITY)).toContain('INC-1042');
    expect(versionDisableReason([], COMPUTER_USE_CAPABILITY)).toBeNull();
    expect(
      versionDisableReason(
        definitions.map((definition) => ({ ...definition, archivedAt: '2026-09-19T00:00:00Z' })),
        COMPUTER_USE_CAPABILITY,
      ),
    ).toBeNull();
  });

  it('reports a range nobody ever lifted, and never archives it automatically', () => {
    const definitions = [stored(versionDisableDefinition(BROKEN_DESKTOP))];
    const stale = findStaleFlags(definitions, LONG_AFTER);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ reason: 'version_disable_left_in_place' });
    expect(archivableStaleFlags(stale)).toEqual([]);
  });
});
