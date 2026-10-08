import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const connectorRelease = vi.hoisted(() => ({ released: false }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  connectorsReleased: () => connectorRelease.released,
}));

const mocks = vi.hoisted(() => ({ buildWorkspaceFeatureGateResponse: vi.fn(async () => null) }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildWorkspaceFeatureGateResponse: mocks.buildWorkspaceFeatureGateResponse,
}));

import { artifactConnectorsGateResponse } from '../artifact-connector-gate';

const HEADERS = { 'Cache-Control': 'private, no-store' };

function request(): NextRequest {
  return new NextRequest('http://localhost/api/artifacts/runtime/token/connectors', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  connectorRelease.released = false;
});

afterEach(() => {
  connectorRelease.released = false;
});

describe('artifactConnectorsGateResponse', () => {
  it.each(['free', 'pro', 'max', 'enterprise'])(
    'answers coming soon on %s rather than naming a plan to upgrade to',
    async (plan) => {
      const response = await artifactConnectorsGateResponse('user-1', request(), plan, HEADERS);

      expect(response?.status).toBe(403);
      expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response?.json()).toEqual({
        error: { code: 'connectors_coming_soon', message: 'Connectors are coming soon.' },
      });
      expect(mocks.buildWorkspaceFeatureGateResponse).not.toHaveBeenCalled();
    },
  );

  it('falls through to the plan and workspace gates once connectors are released', async () => {
    connectorRelease.released = true;

    await expect(
      artifactConnectorsGateResponse('user-1', request(), 'max', HEADERS),
    ).resolves.toBeNull();
    expect(mocks.buildWorkspaceFeatureGateResponse).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      'artifact_connectors',
      'web',
      HEADERS,
    );
  });
});
