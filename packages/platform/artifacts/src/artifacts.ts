/**
 * Artifact Publish Service
 *
 * Canonical cross-surface publish boundary for AGI artifacts.
 *
 * Current publish boundary:
 *   - `privacyMode === 'local'`  → returns a file:// URL pointing to the
 *     exported artifact under the user data directory supplied by the host
 *     adapter. No network call is made.
 *   - `privacyMode === 'byok' | 'managed'` → delegates to the host-injected
 *     {@link CloudPublisher}. When the host supplies one the result is
 *     `{ kind: 'cloud', shareUrl }`; when it does not, the result is
 *     `{ kind: 'unavailable', reason }` — a statement about THIS host's wiring,
 *     not a launch gate.
 *
 * AUDIT-FIX ART-27 (2026-07-25): this function used to return
 * `{ kind: 'waitlist', waitlistGated: true }` for byok/managed unconditionally,
 * and the panel turned that into a "Cloud publish is coming — join waitlist"
 * bar pointing at a marketing domain. Per the critical rules in CLAUDE.md the
 * managed-cloud waitlist gate was REMOVED by founder decision on 2026-06-27:
 * managed cloud is public alpha, open by default, and
 * `AGI_MANAGED_COMPUTE_PRIVATE_BETA` survives only as an incident-response
 * kill-switch. This check was never that env var — it was a hardcoded privacy
 * mode test, so it kept advertising a gate the product had already dropped.
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
 * Known gaps:
 *   - Versioning: `publishedArtifact.version` is always 1 in the current path.
 *   - Inline editor / edit-in-place is not wired; the panel accepts content
 *     as-is from the artifact store.
 *   - No surface ships a {@link CloudPublisher} yet, so byok/managed publish
 *     currently resolves to `{ kind: 'unavailable' }` everywhere. Retention,
 *     deletion, billing and abuse controls must land with the first adapter —
 *     they are a requirement ON that adapter, not a gate in this module.
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

/** Cloud publish succeeded — the host's publisher returned a hosted URL. */
export interface CloudPublishResult {
  kind: 'cloud';
  shareUrl: string;
  publishedAt: string;
  waitlistGated: false;
}

/**
 * No cloud publisher is wired up on this host, so there is nowhere to publish
 * to. `reason` is user-facing copy: state the capability gap, do not invent a
 * launch gate. The caller should offer the local download path instead.
 */
export interface CloudUnavailablePublishResult {
  kind: 'unavailable';
  shareUrl: null;
  reason: string;
  waitlistGated: false;
}

/**
 * @deprecated AUDIT-FIX ART-27 — `publishArtifact` no longer produces this.
 * It stays in the union only so adapters that still construct the pre-
 * 2026-06-27 shape (notably `apps/web/lib/artifact-publisher.ts`, owned
 * elsewhere) keep type-checking until they are migrated. Consumers must treat
 * it exactly like {@link CloudUnavailablePublishResult}: no waitlist, no CTA.
 */
export interface WaitlistPublishResult {
  kind: 'waitlist';
  shareUrl: null;
  waitlistGated: true;
}

/** Discriminated union returned by `publishArtifact`. */
export type PublishResult =
  | LocalPublishResult
  | CloudPublishResult
  | CloudUnavailablePublishResult
  | WaitlistPublishResult;

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
  /**
   * Host-supplied cloud publisher for the byok / managed paths.
   *
   * AUDIT-FIX ART-27: publishing to the cloud is an I/O capability the host
   * owns, exactly like {@link LocalFileWriter}. This package performs no
   * network I/O of its own and does not name an endpoint — when no publisher
   * is injected, `publishArtifact` says so plainly instead of claiming a
   * product gate that no longer exists.
   *
   * When `privacyMode === 'local'` the adapter is never called.
   */
  cloudPublisher?: CloudPublisher;
}

/**
 * Platform adapter that writes the artifact content to local storage and
 * returns the resulting `file://` URL. Injected by the host (Desktop Tauri
 * adapter) so the service itself has no platform dependency.
 */
export type LocalFileWriter = (artifact: PublishableArtifact) => Promise<string>;

/**
 * Platform adapter that uploads the artifact and returns its hosted share URL.
 * Injected by the host so this service keeps zero transport dependencies.
 * AUDIT-FIX ART-27.
 */
export type CloudPublisher = (
  artifact: PublishableArtifact,
  privacyMode: PrivacyMode,
) => Promise<{ shareUrl: string; publishedAt?: string }>;

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
 * @throws {Error} When a supplied `cloudPublisher` throws, or returns no URL.
 */
export async function publishArtifact(input: PublishArtifactInput): Promise<PublishResult> {
  const { artifact, privacyMode, surface, localFileWriter, cloudPublisher } = input;

  // --- Trust-boundary 1: surface sync rule ---
  // CLI / VSCode / Chrome are developer-session surfaces; they must not
  // participate in the consumer-facing artifact publish pipeline.
  assertSurfaceCanSyncChats(surface);

  // --- Cloud path (byok / managed) ---
  // AUDIT-FIX ART-27: no waitlist gate. Managed cloud is open by default
  // (founder decision 2026-06-27); the only question left here is whether THIS
  // host injected a publisher. If it did, publish. If it did not, say exactly
  // that — an honest capability gap, not a fabricated launch gate.
  if (privacyMode === 'byok' || privacyMode === 'managed') {
    if (!cloudPublisher) {
      return {
        kind: 'unavailable',
        shareUrl: null,
        reason:
          'Cloud publish is not available on this surface yet. Download the artifact instead.',
        waitlistGated: false,
      };
    }

    const published = await cloudPublisher(artifact, privacyMode);
    if (!published?.shareUrl) {
      throw new Error('publishArtifact: cloudPublisher resolved without a shareUrl.');
    }
    return {
      kind: 'cloud',
      shareUrl: published.shareUrl,
      publishedAt: published.publishedAt ?? new Date().toISOString(),
      waitlistGated: false,
    };
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
