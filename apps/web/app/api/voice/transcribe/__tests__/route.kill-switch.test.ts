// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { CLIENT_VERSION_HEADER } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  definitions: [] as unknown[],
  nextGate: vi.fn(),
  providerFetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user_dictation' })),
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildManagedComputeGateResponse: (...args: unknown[]) => mocks.nextGate(...args),
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
  DICTATION_CAPABILITY,
  capabilityKillSwitchKey,
  killSwitchDefinition,
} from '@/lib/feature-flags/kill-switches';
import { versionDisableDefinition } from '@/lib/feature-flags/version-disable';

const { POST } = await import('../route');

const PASSED_THE_SWITCH = 299;
const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

function stored(input: FlagDefinitionInput): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

function dictationRequest(headers: Record<string, string> = {}): NextRequest {
  const body = new FormData();
  body.append(
    'file',
    new Blob([new Uint8Array([...WEBM_MAGIC, ...new Uint8Array(32)])], { type: 'audio/webm' }),
    'recording.webm',
  );
  return new NextRequest('http://localhost/api/voice/transcribe', {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer session-token', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.definitions = [];
  mocks.nextGate.mockReturnValue(NextResponse.json({}, { status: PASSED_THE_SWITCH }));
  vi.stubGlobal('fetch', mocks.providerFetch);
});

describe('POST /api/voice/transcribe, the dictation kill switch', () => {
  it('admits a recording while no switch is set', async () => {
    const response = await POST(dictationRequest());

    expect(response.status).toBe(PASSED_THE_SWITCH);
    expect(mocks.nextGate).toHaveBeenCalledTimes(1);
  });

  it('refuses every recording once dictation is switched off, before any provider is paid', async () => {
    mocks.definitions = [
      stored({
        ...killSwitchDefinition(capabilityKillSwitchKey(DICTATION_CAPABILITY), 'dictation'),
        killSwitch: true,
      }),
    ];

    const response = await POST(dictationRequest());

    expect(response.status).toBe(503);
    expect(await response.text()).toContain(
      'Dictation is temporarily switched off while we investigate a problem with it.',
    );
    expect(mocks.nextGate).not.toHaveBeenCalled();
    expect(mocks.providerFetch).not.toHaveBeenCalled();
  });

  it('closes only the builds a version disable names, and says why', async () => {
    mocks.definitions = [
      stored(
        versionDisableDefinition({
          capability: 'dictation',
          surfaces: ['desktop'],
          minVersion: null,
          maxVersion: '2.4.1',
          reason: 'Recordings from this version arrive silent while we fix it.',
          incident: 'INC-412',
        }),
      ),
    ];

    const broken = await POST(
      dictationRequest({ 'x-agi-surface': 'desktop', [CLIENT_VERSION_HEADER]: '2.4.1' }),
    );
    expect(broken.status).toBe(503);
    expect(await broken.text()).toContain(
      'Dictation is switched off for this version. Recordings from this version arrive silent',
    );

    const fixed = await POST(
      dictationRequest({ 'x-agi-surface': 'desktop', [CLIENT_VERSION_HEADER]: '2.4.2' }),
    );
    expect(fixed.status).toBe(PASSED_THE_SWITCH);
  });

  it('leaves the developer transcription API outside the dictation switch', async () => {
    mocks.definitions = [
      stored({
        ...killSwitchDefinition(capabilityKillSwitchKey(DICTATION_CAPABILITY), 'dictation'),
        killSwitch: true,
      }),
    ];
    const { POST: developerPost } = await import('../../../llm/v1/audio/transcriptions/route');

    const response = await developerPost(dictationRequest());

    expect(response.status).toBe(PASSED_THE_SWITCH);
  });
});
