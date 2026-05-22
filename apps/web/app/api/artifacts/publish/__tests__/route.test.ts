/**
 * Tests for POST /api/artifacts/publish
 *
 * Covers:
 *   - Happy path returns 200 with { artifactId, manifestId, publishedAt }
 *   - Trust-boundary violation returns 400 with { code, codes, message }
 *   - DB table missing (42P01) returns 503 with artifact_persistence_unavailable
 */

import { describe, it, expect, vi } from 'vitest';

const { mockPublishArtifact, mockGetAuth, mockRequireCsrf, mockWithRateLimit } = vi.hoisted(() => ({
  mockPublishArtifact: vi.fn(),
  mockGetAuth: vi.fn().mockResolvedValue({ user: { id: 'user-1' }, userDb: {} }),
  mockRequireCsrf: vi.fn().mockResolvedValue(null),
  mockWithRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockRequireCsrf }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockWithRateLimit }));
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUserWithClient: mockGetAuth }));

vi.mock('@/lib/artifact-publisher', () => {
  class TrustBoundaryViolationError extends Error {
    codes: string[];
    constructor(codes: string[], message: string) {
      super(message);
      this.name = 'TrustBoundaryViolationError';
      this.codes = codes;
    }
  }
  class ArtifactPersistenceUnavailableError extends Error {
    constructor() {
      super('Artifact persistence requires Cloud Managed (pending private beta migration)');
      this.name = 'ArtifactPersistenceUnavailableError';
    }
  }
  return {
    publishArtifact: mockPublishArtifact,
    TrustBoundaryViolationError,
    ArtifactPersistenceUnavailableError,
  };
});

import { POST } from '../route';
import {
  TrustBoundaryViolationError,
  ArtifactPersistenceUnavailableError,
} from '@/lib/artifact-publisher';

function makeValidBody() {
  return {
    computeSession: {
      id: 'session-1',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      status: 'completed',
      workdirUri: 'managed://workdir/session-1',
      ttlSeconds: 3600,
      retentionExpiresAt: '2026-06-01T00:00:00Z',
      createdAt: '2026-05-22T00:00:00Z',
      updatedAt: '2026-05-22T01:00:00Z',
    },
    generatedFile: {
      id: 'file-1',
      computeSessionId: 'session-1',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'managed://files/file-1',
      byteCount: 1024,
      checksumSha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      previewDerivatives: [],
      createdAt: '2026-05-22T00:30:00Z',
    },
    artifactManifest: {
      id: 'manifest-1',
      artifactId: 'artifact-1',
      type: 'generated_file_bundle',
      title: 'Report',
      computeSessionId: 'session-1',
      generatedFileIds: ['file-1'],
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      storageScope: 'managed_compute',
      checksumSha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      createdAt: '2026-05-22T00:30:00Z',
      updatedAt: '2026-05-22T00:30:00Z',
    },
    managed: { quotaReservationId: 'quota-1' },
  };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/artifacts/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-token' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/artifacts/publish', () => {
  it('happy path returns 200 with artifactId, manifestId, publishedAt', async () => {
    mockGetAuth.mockResolvedValueOnce({ user: { id: 'user-1' }, userDb: {} });
    mockRequireCsrf.mockResolvedValueOnce(null);
    mockWithRateLimit.mockResolvedValueOnce(null);
    mockPublishArtifact.mockResolvedValueOnce({
      artifactId: 'artifact-row-1',
      manifestId: 'manifest-1',
      publishedAt: '2026-05-22T01:00:00Z',
    });

    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body['artifactId']).toBe('artifact-row-1');
    expect(body['manifestId']).toBe('manifest-1');
    expect(body['publishedAt']).toBe('2026-05-22T01:00:00Z');
  });

  it('trust-boundary violation returns 400 with code and codes array', async () => {
    mockGetAuth.mockResolvedValueOnce({ user: { id: 'user-1' }, userDb: {} });
    mockRequireCsrf.mockResolvedValueOnce(null);
    mockWithRateLimit.mockResolvedValueOnce(null);
    mockPublishArtifact.mockRejectedValueOnce(
      new TrustBoundaryViolationError(
        ['compute-session-mismatch'],
        'AGI generated-file trust-boundary violation [compute-session-mismatch]:\n- compute-session-mismatch: ...',
      ),
    );

    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['code']).toBe('trust-boundary-violation');
    expect(Array.isArray(body['codes'])).toBe(true);
    expect((body['codes'] as string[]).includes('compute-session-mismatch')).toBe(true);
    expect(typeof body['message']).toBe('string');
  });

  it('DB table missing (42P01) returns 503 with artifact_persistence_unavailable', async () => {
    mockGetAuth.mockResolvedValueOnce({ user: { id: 'user-1' }, userDb: {} });
    mockRequireCsrf.mockResolvedValueOnce(null);
    mockWithRateLimit.mockResolvedValueOnce(null);
    mockPublishArtifact.mockRejectedValueOnce(new ArtifactPersistenceUnavailableError());

    const res = await POST(makeRequest(makeValidBody()));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, string>;
    expect(body['error']).toBe('artifact_persistence_unavailable');
    expect(body['message']).toContain('Cloud Managed');
  });
});
