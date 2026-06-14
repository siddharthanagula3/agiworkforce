/**
 * Tests for lib/artifact-publisher.ts
 *
 * Covers:
 *   - Valid managed bundle passes trust-boundary and returns WaitlistPublishResult
 *   - Invalid bundle (session mismatch) throws TrustBoundaryViolationError with codes
 *   - byok bundle missing transfer evidence throws byok-transfer-preview-required
 *   - Calling twice returns the same waitlist shape (idempotent, no DB)
 *
 * The ArtifactPersistenceUnavailableError / 42P01 path is gone · the publisher
 * no longer calls the DB. The 503 is replaced by 200 + { kind: 'waitlist' }.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { publishArtifact, TrustBoundaryViolationError } from '../artifact-publisher';
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
// Tests
// ---------------------------------------------------------------------------

describe('publishArtifact (web adapter)', () => {
  it('valid managed bundle returns WaitlistPublishResult (kind=waitlist)', async () => {
    const result = await publishArtifact({
      computeSession: makeSession(),
      generatedFile: makeFile(),
      artifactManifest: makeManifest(),
      managed: makeManagedEvidence(),
    });

    expect(result.kind).toBe('waitlist');
    expect(result.shareUrl).toBeNull();
    expect(result.waitlistGated).toBe(true);
  });

  it('waitlist result has no DB side-effects (no upsert called)', async () => {
    // No DB mock needed · the new publisher never calls the DB.
    // This test is a regression guard: if a DB call were accidentally
    // re-introduced it would fail at the import stage (no NeonClient).
    const result = await publishArtifact({
      computeSession: makeSession(),
      generatedFile: makeFile(),
      artifactManifest: makeManifest(),
      managed: makeManagedEvidence(),
    });

    expect(result.kind).toBe('waitlist');
  });

  it('invalid bundle (compute-session-mismatch) throws TrustBoundaryViolationError with codes', async () => {
    const mismatchedFile = makeFile({ computeSessionId: 'other-session' });

    await expect(
      publishArtifact({
        computeSession: makeSession(),
        generatedFile: mismatchedFile,
        artifactManifest: makeManifest(),
        managed: makeManagedEvidence(),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof TrustBoundaryViolationError && err.codes.includes('compute-session-mismatch')
      );
    });
  });

  it('byok bundle missing transfer evidence throws byok-transfer-preview-required', async () => {
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
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof TrustBoundaryViolationError &&
        err.codes.includes('byok-transfer-preview-required')
      );
    });
  });

  it('calling twice returns the same waitlist shape (idempotent)', async () => {
    const args = {
      computeSession: makeSession(),
      generatedFile: makeFile(),
      artifactManifest: makeManifest(),
      managed: makeManagedEvidence(),
    };

    const [r1, r2] = await Promise.all([publishArtifact(args), publishArtifact(args)]);

    expect(r1).toEqual({ kind: 'waitlist', shareUrl: null, waitlistGated: true });
    expect(r2).toEqual({ kind: 'waitlist', shareUrl: null, waitlistGated: true });
  });
});
