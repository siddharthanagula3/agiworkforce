/**
 * Tests for lib/artifact-publisher.ts
 *
 * Covers:
 *   - Valid bundle passes trust-boundary and calls DB upsert
 *   - Invalid bundle throws TrustBoundaryViolationError with codes
 *   - Missing transfer evidence for byok target throws appropriate code
 *   - DB table-not-found (42P01) throws ArtifactPersistenceUnavailableError
 *   - Idempotency: same triple calls upsert with same onConflict key
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  publishArtifact,
  TrustBoundaryViolationError,
  ArtifactPersistenceUnavailableError,
} from '../artifact-publisher';
import type {
  ComputeSession,
  GeneratedFile,
  ArtifactManifest,
  GeneratedFileTransferEvidence,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Minimal valid fixtures for managed privacy mode
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<ComputeSession> = {}): ComputeSession {
  return {
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
    ...overrides,
  };
}

function makeFile(overrides: Partial<GeneratedFile> = {}): GeneratedFile {
  return {
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
    ...overrides,
  };
}

function makeManifest(overrides: Partial<ArtifactManifest> = {}): ArtifactManifest {
  return {
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
    ...overrides,
  };
}

function makeManagedEvidence() {
  return { quotaReservationId: 'quota-1' };
}

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

function makeUpsertChain(result: { data: unknown; error: unknown }) {
  const singleFn = vi.fn().mockResolvedValue(result);
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const upsertFn = vi.fn().mockReturnValue({ select: selectFn });
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn });
  return { fromFn, upsertFn, selectFn, singleFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('publishArtifact', () => {
  it('valid managed bundle passes trust-boundary and calls DB upsert', async () => {
    const { fromFn, upsertFn } = makeUpsertChain({
      data: {
        id: 'artifact-row-1',
        artifact_manifest_id: 'manifest-1',
        published_at: '2026-05-22T01:00:00Z',
      },
      error: null,
    });
    const userDb = { from: fromFn } as never;

    const result = await publishArtifact({
      computeSession: makeSession(),
      generatedFile: makeFile(),
      artifactManifest: makeManifest(),
      managed: makeManagedEvidence(),
      userDb,
      userId: 'user-1',
    });

    expect(fromFn).toHaveBeenCalledWith('published_artifacts');
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        compute_session_id: 'session-1',
        generated_file_id: 'file-1',
        artifact_manifest_id: 'manifest-1',
        owner_user_id: 'user-1',
        privacy_mode: 'managed',
        provider_mode: 'ManagedGateway',
        source_surface: 'web',
      }),
      { onConflict: 'compute_session_id,generated_file_id,artifact_manifest_id' },
    );
    expect(result.artifactId).toBe('artifact-row-1');
    expect(result.manifestId).toBe('manifest-1');
    expect(result.publishedAt).toBe('2026-05-22T01:00:00Z');
  });

  it('invalid bundle (compute-session-mismatch) throws TrustBoundaryViolationError with codes', async () => {
    const userDb = { from: vi.fn() } as never;

    const mismatchedFile = makeFile({ computeSessionId: 'other-session' });

    await expect(
      publishArtifact({
        computeSession: makeSession(),
        generatedFile: mismatchedFile,
        artifactManifest: makeManifest(),
        managed: makeManagedEvidence(),
        userDb,
        userId: 'user-1',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof TrustBoundaryViolationError && err.codes.includes('compute-session-mismatch')
      );
    });
  });

  it('byok bundle missing transfer evidence throws byok-transfer-preview-required', async () => {
    const userDb = { from: vi.fn() } as never;

    const byokSession = makeSession({ privacyMode: 'byok', providerMode: 'DirectByok' });
    const byokFile = makeFile({
      computeSessionId: 'session-1',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      uri: 'https://byok-provider.example/file-1',
    });
    const byokManifest = makeManifest({
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      storageScope: 'direct_byok_provider',
    });
    const incompleteTransfer: GeneratedFileTransferEvidence = {
      targetPrivacyMode: 'byok',
      previewAccepted: false,
      approved: false,
    };

    await expect(
      publishArtifact({
        computeSession: byokSession,
        generatedFile: byokFile,
        artifactManifest: byokManifest,
        transfer: incompleteTransfer,
        userDb,
        userId: 'user-1',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof TrustBoundaryViolationError &&
        err.codes.includes('byok-transfer-preview-required')
      );
    });
  });

  it('DB table-not-found (42P01) throws ArtifactPersistenceUnavailableError', async () => {
    const { fromFn } = makeUpsertChain({
      data: null,
      error: { message: 'relation "published_artifacts" does not exist', code: '42P01' },
    });
    const userDb = { from: fromFn } as never;

    await expect(
      publishArtifact({
        computeSession: makeSession(),
        generatedFile: makeFile(),
        artifactManifest: makeManifest(),
        managed: makeManagedEvidence(),
        userDb,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ArtifactPersistenceUnavailableError);
  });

  it('is idempotent: same triple always calls upsert with same onConflict key', async () => {
    const makeResult = () => ({
      data: {
        id: 'artifact-row-1',
        artifact_manifest_id: 'manifest-1',
        published_at: '2026-05-22T01:00:00Z',
      },
      error: null,
    });
    const upsertCalls: unknown[] = [];

    const mockUpsert = vi.fn((row: unknown, opts: unknown) => {
      upsertCalls.push({ row, opts });
      return {
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(makeResult()) }),
      };
    });
    const userDb = { from: vi.fn().mockReturnValue({ upsert: mockUpsert }) } as never;

    const args = {
      computeSession: makeSession(),
      generatedFile: makeFile(),
      artifactManifest: makeManifest(),
      managed: makeManagedEvidence(),
      userDb,
      userId: 'user-1',
    };

    await publishArtifact(args);
    await publishArtifact(args);

    expect(mockUpsert).toHaveBeenCalledTimes(2);

    for (const call of upsertCalls) {
      const c = call as { row: Record<string, unknown>; opts: { onConflict: string } };
      expect(c.opts.onConflict).toBe('compute_session_id,generated_file_id,artifact_manifest_id');
      expect(c.row['compute_session_id']).toBe('session-1');
      expect(c.row['generated_file_id']).toBe('file-1');
      expect(c.row['artifact_manifest_id']).toBe('manifest-1');
    }
  });
});
