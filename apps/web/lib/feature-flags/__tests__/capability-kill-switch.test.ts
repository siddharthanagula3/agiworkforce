import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/data-region', () => ({ managedCloudDataRegion: () => 'us-east-1' }));

const store = vi.hoisted(() => ({
  definitions: [] as unknown[],
  overrides: [] as unknown[],
}));

vi.mock('../flag-store', () => ({
  getActiveFlagDefinitions: async () => store.definitions,
  getSubjectOverrides: async () => store.overrides,
}));

import { assertCapabilityAvailable, readKillSwitchGate } from '../capability-gate';
import type { FlagDefinition } from '../flag-definition';
import type { FlagSubject } from '../evaluate-flags';
import {
  BROWSER_CAPABILITY,
  COMPUTER_USE_CAPABILITY,
  TENANT_LOCKDOWN_FLAG_KEY,
  WORK_CAPABILITY,
  activeKillSwitches,
  capabilityKillSwitchKey,
  clientVersionKillRule,
  killSwitchDefinition,
  modelKillSwitchKey,
  providerKillSwitchKey,
} from '../kill-switches';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-17T12:00:00.000Z');

function definition(key: string, patch: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    ...killSwitchDefinition(key, `switch for ${key}`),
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...patch,
  };
}

function subject(patch: Partial<FlagSubject> = {}): FlagSubject {
  return {
    userId: 'user_1',
    workspaceId: WORKSPACE_ID,
    role: 'member',
    plan: 'pro',
    region: 'us-east-1',
    country: 'US',
    surface: 'desktop',
    clientVersion: '2.4.1',
    ...patch,
  };
}

beforeEach(() => {
  store.definitions = [];
  store.overrides = [];
});

describe('capability kill switches', () => {
  it('leaves every capability as it shipped while no switch exists', async () => {
    const gate = await readKillSwitchGate(subject(), NOW);

    expect(gate.capabilityAllowed(COMPUTER_USE_CAPABILITY)).toBe(true);
    expect(gate.capabilityAllowed(BROWSER_CAPABILITY)).toBe(true);
    expect(gate.capabilityAllowed(WORK_CAPABILITY)).toBe(true);
    expect(gate.closedCapabilities).toEqual([]);
  });

  it.each([
    ['Computer Use', COMPUTER_USE_CAPABILITY, BROWSER_CAPABILITY],
    ['Browser', BROWSER_CAPABILITY, WORK_CAPABILITY],
    ['Work', WORK_CAPABILITY, COMPUTER_USE_CAPABILITY],
  ])(
    'flipping the %s switch stops it without touching the others',
    async (_label, killed, spared) => {
      store.definitions = [definition(capabilityKillSwitchKey(killed), { killSwitch: true })];

      const gate = await readKillSwitchGate(subject(), NOW);

      expect(gate.capabilityAllowed(killed)).toBe(false);
      expect(gate.capabilityAllowed(spared)).toBe(true);
      expect(gate.closedCapabilities).toEqual([killed]);
    },
  );

  it('refuses new work on a switched-off capability with a reason the caller can show', async () => {
    store.definitions = [
      definition(capabilityKillSwitchKey(COMPUTER_USE_CAPABILITY), { killSwitch: true }),
    ];

    await expect(
      assertCapabilityAvailable(subject(), COMPUTER_USE_CAPABILITY, 'Computer Use', NOW),
    ).rejects.toMatchObject({ statusCode: 503 });

    await expect(
      assertCapabilityAvailable(subject(), BROWSER_CAPABILITY, 'Browser', NOW),
    ).resolves.toBeUndefined();
  });

  it('closes a capability for one range of client versions only', async () => {
    store.definitions = [
      definition(capabilityKillSwitchKey(WORK_CAPABILITY), {
        rules: [clientVersionKillRule('broken-2-4', { min: '2.4.0', max: '2.4.9' }, ['desktop'])],
      }),
    ];

    const affected = await readKillSwitchGate(subject({ clientVersion: '2.4.1' }), NOW);
    const repaired = await readKillSwitchGate(subject({ clientVersion: '2.5.0' }), NOW);
    const otherSurface = await readKillSwitchGate(
      subject({ clientVersion: '2.4.1', surface: 'mobile' }),
      NOW,
    );

    expect(affected.capabilityAllowed(WORK_CAPABILITY)).toBe(false);
    expect(repaired.capabilityAllowed(WORK_CAPABILITY)).toBe(true);
    expect(otherSurface.capabilityAllowed(WORK_CAPABILITY)).toBe(true);
  });

  it('closes a capability for one workspace through an override', async () => {
    const key = capabilityKillSwitchKey(BROWSER_CAPABILITY);
    store.definitions = [definition(key)];
    store.overrides = [
      {
        flagKey: key,
        subject: 'workspace',
        subjectId: WORKSPACE_ID,
        variant: 'off',
        expiresAt: null,
      },
    ];

    const held = await readKillSwitchGate(subject(), NOW);
    const untouched = await readKillSwitchGate(subject({ workspaceId: OTHER_WORKSPACE_ID }), NOW);

    expect(held.capabilityAllowed(BROWSER_CAPABILITY)).toBe(false);
    expect(untouched.capabilityAllowed(BROWSER_CAPABILITY)).toBe(true);
  });

  it('switches one model and one provider off without a release', async () => {
    store.definitions = [
      definition(modelKillSwitchKey('vendor-model-alpha'), { killSwitch: true }),
      definition(providerKillSwitchKey('groq'), { killSwitch: true }),
    ];

    const gate = await readKillSwitchGate(subject(), NOW);

    expect(gate.modelAllowed('vendor-model-alpha')).toBe(false);
    expect(gate.modelAllowed('vendor-model-beta')).toBe(true);
    expect(gate.providerAllowed('groq')).toBe(false);
    expect(gate.providerAllowed('anthropic')).toBe(true);
  });

  it('holds a workspace off entirely when it is locked down', async () => {
    store.definitions = [definition(TENANT_LOCKDOWN_FLAG_KEY)];
    store.overrides = [
      {
        flagKey: TENANT_LOCKDOWN_FLAG_KEY,
        subject: 'workspace',
        subjectId: WORKSPACE_ID,
        variant: 'off',
        expiresAt: null,
      },
    ];

    const locked = await readKillSwitchGate(subject(), NOW);
    const free = await readKillSwitchGate(subject({ workspaceId: OTHER_WORKSPACE_ID }), NOW);

    expect(locked.tenantLockedDown).toBe(true);
    expect(free.tenantLockedDown).toBe(false);
    await expect(
      assertCapabilityAvailable(subject(), WORK_CAPABILITY, 'Work', NOW),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lists every switch that is currently holding something off', () => {
    const active = activeKillSwitches([
      definition(capabilityKillSwitchKey(COMPUTER_USE_CAPABILITY), { killSwitch: true }),
      definition(modelKillSwitchKey('vendor-model-alpha'), { killSwitch: true }),
      definition(capabilityKillSwitchKey(WORK_CAPABILITY), {
        rules: [clientVersionKillRule('broken-2-4', { max: '2.4.9' })],
      }),
      definition(capabilityKillSwitchKey(BROWSER_CAPABILITY)),
    ]);

    expect(active.map((entry) => entry.key)).toEqual([
      capabilityKillSwitchKey(COMPUTER_USE_CAPABILITY),
      modelKillSwitchKey('vendor-model-alpha'),
      capabilityKillSwitchKey(WORK_CAPABILITY),
    ]);
    expect(active[0]).toMatchObject({ scope: 'capability', global: true });
    expect(active[1]).toMatchObject({ scope: 'model', subject: 'vendor-model-alpha' });
    expect(active[2]?.versionRules).toEqual([{ ruleId: 'broken-2-4', min: null, max: '2.4.9' }]);
  });

  it('keeps every capability open when the flag store cannot be read', async () => {
    store.definitions = [];

    const gate = await readKillSwitchGate(subject(), NOW);

    expect(gate.capabilityAllowed(COMPUTER_USE_CAPABILITY)).toBe(true);
    expect(gate.tenantLockedDown).toBe(false);
  });
});
