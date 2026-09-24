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
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  capabilityForKillSwitchKey,
  capabilityKillSwitchKey,
  killSwitchDefinition,
} from '../kill-switches';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');

const SUBJECT: FlagSubject = {
  userId: 'user_1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  role: 'member',
  plan: 'pro',
  region: 'us-east-1',
  country: 'US',
  surface: 'desktop',
  clientVersion: '2.4.1',
};

function flipped(key: string): FlagDefinition {
  return {
    ...killSwitchDefinition(key, `switch for ${key}`),
    killSwitch: true,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

beforeEach(() => {
  store.definitions = [];
});

describe('every kill switch in the vocabulary', () => {
  it('has a key that maps back to the capability it closes', () => {
    for (const capability of ALL_KILL_SWITCH_CAPABILITIES) {
      expect(capabilityForKillSwitchKey(capabilityKillSwitchKey(capability))).toBe(capability);
    }
    const keys = ALL_KILL_SWITCH_CAPABILITIES.map(capabilityKillSwitchKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(ALL_KILL_SWITCH_CAPABILITIES.map((capability) => [capability]))(
    'flipping %s closes exactly that capability',
    async (capability) => {
      store.definitions = [flipped(capabilityKillSwitchKey(capability))];

      const gate = await readKillSwitchGate(SUBJECT, NOW);

      expect(gate.closedCapabilities).toEqual([capability]);
      for (const other of ALL_KILL_SWITCH_CAPABILITIES) {
        expect(gate.capabilityAllowed(other), other).toBe(other !== capability);
      }
      await expect(
        assertCapabilityAvailable(SUBJECT, capability, capability, NOW),
      ).rejects.toMatchObject({ statusCode: 503 });
    },
  );

  it('leaves every capability open while no switch is flipped', async () => {
    const gate = await readKillSwitchGate(SUBJECT, NOW);

    expect(gate.closedCapabilities).toEqual([]);
    for (const capability of ALL_KILL_SWITCH_CAPABILITIES) {
      await expect(
        assertCapabilityAvailable(SUBJECT, capability, capability, NOW),
      ).resolves.toBeUndefined();
    }
  });
});
