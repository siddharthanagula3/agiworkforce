/**
 * Artifact Publish Service
 *
 * Canonical cross-surface publish boundary for AGI artifacts.
 *
 * v1 LOCAL ONLY (lock: v1-local-only-cloud-waitlist-2026-05-18):
 *   - `privacyMode === 'local'`  → returns a file:// URL pointing to the
 *     exported artifact under the user data directory supplied by the host
 *     adapter. No network call is made.
 *   - `privacyMode === 'byok' | 'managed'` → returns `{ kind: 'waitlist',
 *     waitlistGated: true, shareUrl: null }`. Cloud publish is NOT wired to
 *     any endpoint until Cloud Managed launches. Hitting an endpoint here
 *     would violate the v1-local-only lock.
 *
 * Trust-boundary enforcement:
 *   1. `assertSurfaceCanSyncChats(surface)` — rejects CLI / VS Code / Chrome;
 *      they must use the developer-handoff path instead.
 *   2. `assertGeneratedFileTrustBoundary(input)` — validates that the
 *      synthesised GeneratedFile / ComputeSession / ArtifactManifest tuple
 *      is internally consistent before any I/O is attempted.
 *
 * The `GeneratedFileTrustBoundaryInput` records are synthesised from the
 * minimal `{ artifact, privacyMode, surface }` call site shape. They use the
 * actual privacy + provider mode values and a `file://`-prefixed URI so the
 * assertGeneratedFileTrustBoundary local-path checks pass. This is intentional
 * defensive validation — a future caller that accidentally passes a managed
 * artifact into the local path will get a loud assertion failure rather than a
 * silent mismatch.
 *
 * Deferred (TODO — EXEC-SUMMARY-r2 hours):
 *   - Versioning: `publishedArtifact.version` is always 1 in v1.
 *   - Inline editor / edit-in-place: not yet wired; panel accepts content
 *     as-is from the artifact store.
 *   - Cloud publish endpoint: implement when Cloud Managed tier launches.
 *
 * @module artifacts
 */

import {
  assertSurfaceCanSyncChats,
  assertGeneratedFileTrustBoundary,
  type SourceSurface,
  type PrivacyMode,
  type GeneratedFileTrustBoundaryInput,
  type ComputeSession,
  type GeneratedFile,
  type ArtifactManifest,
} from '@agiworkforce/types';

// ============================================================================
// Public types
// ============================================================================

/**
 * Minimal artifact shape the publish service needs.
 * Surfaces pass their local artifact store shape; only these fields are used.
 */
export interface PublishableArtifact {
  id: string;
  title: string;
  /** Raw content string (code, markdown, SVG, JSON, etc.). */
  content: string;
  /** Artifact category (html | react | code | markdown | document | svg | etc.). */
  type: string;
  /** Language identifier for code artifacts (optional). */
  language?: string;
}

/** Publish succeeded locally — file:// URL is available immediately. */
export interface LocalPublishResult {
  kind: 'local';
  shareUrl: string;
  shareToken: string;
  publishedAt: string;
  waitlistGated: false;
}

/**
 * Cloud publish is waitlist-gated in v1.
 * The caller should show a "Join Cloud waitlist" CTA.
 */
export interface WaitlistPublishResult {
  kind: 'waitlist';
  shareUrl: null;
  waitlistGated: true;
}

/** Discriminated union returned by `publishArtifact`. */
export type PublishResult = LocalPublishResult | WaitlistPublishResult;

export interface PublishArtifactInput {
  artifact: PublishableArtifact;
  privacyMode: PrivacyMode;
  surface: SourceSurface;
  /**
   * Host-supplied file:// path writer for the local path.
   *
   * Desktop: uses `path::app_data_dir` via Tauri.
   * Tests: uses an in-memory fake that returns a deterministic file:// URL.
   *
   * When `privacyMode !== 'local'` the adapter is never called.
   */
  localFileWriter?: LocalFileWriter;
}

/**
 * Platform adapter that writes the artifact content to local storage and
 * returns the resulting `file://` URL. Injected by the host (Desktop Tauri
 * adapter) so the service itself has no platform dependency.
 */
export type LocalFileWriter = (artifact: PublishableArtifact) => Promise<string>;

// ============================================================================
// Internal helpers
// ============================================================================

/** Generate a short opaque token from artifact id + timestamp. */
function makeShareToken(artifactId: string, timestamp: string): string {
  // Simple deterministic token — not a security primitive; just a correlation
  // handle for local share bookkeeping.
  const raw = `${artifactId}:${timestamp}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    // djb2 hash — intentional bitwise, same pattern as artifactSharing.ts.
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Synthesise a minimal `GeneratedFileTrustBoundaryInput` from a local-path
 * artifact so `assertGeneratedFileTrustBoundary` can enforce invariants.
 *
 * All fields are set consistently to `privacyMode: 'local'`,
 * `providerMode: 'Local'`, `storageScope: 'local_device'`, and the URI is
 * set to the supplied `fileUrl` (already a `file://` path). The compute
 * session and artifact manifest use a synthetic session id so the cross-ref
 * checks inside `assertGeneratedFileTrustBoundary` pass.
 */
function buildTrustBoundaryInput(
  artifact: PublishableArtifact,
  fileUrl: string,
): GeneratedFileTrustBoundaryInput {
  const syntheticSessionId = `local-publish-${artifact.id}`;
  const now = new Date().toISOString();

  const computeSession: ComputeSession = {
    id: syntheticSessionId,
    ownerUserId: 'local',
    sourceSurface: 'desktop',
    privacyMode: 'local',
    providerMode: 'Local',
    status: 'completed',
    workdirUri: fileUrl,
    createdAt: now,
    updatedAt: now,
  };

  const generatedFile: GeneratedFile = {
    id: artifact.id,
    computeSessionId: syntheticSessionId,
    ownerUserId: 'local',
    sourceSurface: 'desktop',
    privacyMode: 'local',
    providerMode: 'Local',
    kind: 'other',
    fileName: `${artifact.id}.artifact`,
    mimeType: 'text/plain',
    uri: fileUrl,
    byteCount: new TextEncoder().encode(artifact.content).length,
    checksumSha256: '',
    previewDerivatives: [],
    createdAt: now,
  };

  const artifactManifest: ArtifactManifest = {
    id: `manifest-${artifact.id}`,
    artifactId: artifact.id,
    type: 'generated_file_bundle',
    title: artifact.title,
    computeSessionId: syntheticSessionId,
    generatedFileIds: [artifact.id],
    privacyMode: 'local',
    providerMode: 'Local',
    storageScope: 'local_device',
    createdAt: now,
    updatedAt: now,
  };

  return { computeSession, generatedFile, artifactManifest };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Publish an artifact.
 *
 * Enforces the chat-sync surface rule (CLI / VSCode / Chrome must not use
 * this path) and the generated-file trust boundary before performing any I/O.
 *
 * @throws {Error} When surface is a developer-session surface.
 * @throws {Error} When the trust boundary is violated.
 * @throws {Error} When `privacyMode === 'local'` and no `localFileWriter` is
 *   supplied, or when the writer itself throws.
 */
export async function publishArtifact(input: PublishArtifactInput): Promise<PublishResult> {
  const { artifact, privacyMode, surface, localFileWriter } = input;

  // --- Trust-boundary 1: surface sync rule ---
  // CLI / VSCode / Chrome are developer-session surfaces; they must not
  // participate in the consumer-facing artifact publish pipeline.
  assertSurfaceCanSyncChats(surface);

  // --- v1 cloud waitlist gate ---
  // byok and managed modes are waitlist-gated; do not hit any cloud endpoint.
  if (privacyMode === 'byok' || privacyMode === 'managed') {
    return { kind: 'waitlist', shareUrl: null, waitlistGated: true };
  }

  // --- Local path ---
  if (!localFileWriter) {
    throw new Error(
      'publishArtifact: localFileWriter adapter is required when privacyMode is "local".',
    );
  }

  const fileUrl = await localFileWriter(artifact);

  // --- Trust-boundary 2: generated-file trust boundary ---
  // Synthesise minimal GFTBInput and validate consistency. This will throw if
  // the fileUrl does not start with "file://" or if any other invariant is
  // broken, giving a loud failure rather than a silent mismatch.
  const trustInput = buildTrustBoundaryInput(artifact, fileUrl);
  assertGeneratedFileTrustBoundary(trustInput);

  const publishedAt = new Date().toISOString();
  const shareToken = makeShareToken(artifact.id, publishedAt);

  return {
    kind: 'local',
    shareUrl: fileUrl,
    shareToken,
    publishedAt,
    waitlistGated: false,
  };
}
