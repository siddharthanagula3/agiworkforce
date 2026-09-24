import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CLIENT_VERSION_HEADER } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  definitions: [] as unknown[],
  signaling: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildWorkspaceFeatureGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(), execute: vi.fn() },
    userId: 'user_remote',
    organizationId: null,
  })),
}));
vi.mock('@/lib/workspace-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspace-audit')>()),
  recordWorkspaceAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/observability/denials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/denials')>()),
  recordCapabilityDenial: vi.fn(),
}));
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/data-region')>()),
  managedCloudDataRegion: () => 'us-east-1',
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/flag-store')>()),
  getActiveFlagDefinitions: async () => mocks.definitions,
  getSubjectOverrides: async () => [],
}));

import type { FlagDefinition, FlagDefinitionInput } from '@/lib/feature-flags/flag-definition';
import {
  SCREEN_SHARE_CAPABILITY,
  capabilityKillSwitchKey,
  killSwitchDefinition,
} from '@/lib/feature-flags/kill-switches';
import { versionDisableDefinition } from '@/lib/feature-flags/version-disable';

import { POST as initiate } from '../initiate/route';
import { POST as claim } from '../claim/route';

const SWITCHED_OFF =
  'Remote Control is temporarily switched off while we investigate a problem with it.';

function stored(input: FlagDefinitionInput): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

function switchedOffForEveryone(): FlagDefinition {
  return stored({
    ...killSwitchDefinition(capabilityKillSwitchKey(SCREEN_SHARE_CAPABILITY), 'screen share'),
    killSwitch: true,
  });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const initiateRequest = (headers?: Record<string, string>) =>
  post('/api/pair/initiate', { initiator: 'desktop' }, headers);
const claimRequest = () => post('/api/pair/claim', { code: 'ABCD1234WXYZ' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.definitions = [];
  mocks.signaling.mockImplementation(
    async () => new Response(JSON.stringify({ error: 'unused' }), { status: 502 }),
  );
  vi.stubGlobal('fetch', mocks.signaling);
  vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
  vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Remote Control pairing under the screen share switch', () => {
  it('reaches the relay for both halves of a pairing while nothing is switched off', async () => {
    await initiate(initiateRequest());
    await claim(claimRequest());

    expect(mocks.signaling).toHaveBeenCalledTimes(2);
  });

  it('refuses both halves of a pairing, and says why, once the switch is closed', async () => {
    mocks.definitions = [switchedOffForEveryone()];

    for (const response of [await initiate(initiateRequest()), await claim(claimRequest())]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: SWITCHED_OFF });
    }
    expect(mocks.signaling).not.toHaveBeenCalled();
  });

  it('closes pairing only for the builds a version disable names', async () => {
    mocks.definitions = [
      stored(
        versionDisableDefinition({
          capability: 'screen_share',
          surfaces: [],
          minVersion: null,
          maxVersion: '2.4.1',
          reason: 'Paired phones on this version lose control mid-session.',
          incident: 'INC-88',
        }),
      ),
    ];

    const held = await initiate(initiateRequest({ [CLIENT_VERSION_HEADER]: '2.4.1' }));
    expect(held.status).toBe(503);
    expect((await held.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('Remote Control is switched off for this version.'),
    });
    expect(mocks.signaling).not.toHaveBeenCalled();

    await initiate(initiateRequest({ [CLIENT_VERSION_HEADER]: '2.4.2' }));
    expect(mocks.signaling).toHaveBeenCalledTimes(1);
  });
});
