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
 *     {@link CloudPublisher}, but ONLY after the trust-boundary cross-check in
 *     {@link cloudPublishDenial} passes. When the host supplies no publisher
 *     the result is `{ kind: 'unavailable', reason }` — a statement about THIS
 *     host's wiring, not a launch gate.
 *
 * SECURITY-FIX F3 (CWE-863, 2026-08-21): the caller's `privacyMode` used to be
 * the whole authorization decision, so a UI that hardcoded `'managed'` could
 * hand a Local or BYOK artifact to the managed-cloud publisher. The caller now
 * also declares {@link PublishArtifactInput.originPrivacyMode} — the boundary
 * the artifact was actually produced in — and the injected {@link CloudPublisher}
 * is a managed-cloud sink, so it is reachable only when the artifact itself
 * originated in managed mode and the caller asked for that same mode. A Local
 * or BYOK artifact resolves to `{ kind: 'unavailable' }` instead: moving it
 * across that boundary needs the explicit handoff ceremony (context selection,
 * secret scan, payload preview, consent), which this path does not implement.
 * Hosts derive that origin with {@link resolveOriginPrivacyMode}, which reduces
 * every boundary signal they observed to the most restrictive one and yields
 * `undefined` when they observed nothing at all.
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
 *   - Versioning: a publish result carries no version at all — neither
 *     {@link LocalPublishResult} nor {@link CloudPublishResult} has the field,
 *     and the web adapter's storage (apps/web/db/neon/0095_published_artifacts.sql)
 *     has no version column: republishing UPSERTs on (user_id, artifact_id), so
 *     the public page always shows the latest content and earlier published
 *     revisions are not addressable. Edit history is a client-side concept
 *     (`versionsById` in the artifact store) and does not reach a published page.
 *   - Inline editor / edit-in-place is not wired on web; the panel accepts
 *     content as-is from the artifact store. Desktop does have one
 *     (features/artifacts/InlineArtifactEditor.tsx, saved through
 *     `applyDiffToArtifact`), and it is not conflict-aware.
 *   - Web ships the first {@link CloudPublisher} (CAP-015): the ArtifactsPanel
 *     injects `createWebCloudPublisher()`, which POSTs to
 *     `/api/artifacts/publish` and returns a `/shared-artifact/<token>` URL.
 *     Desktop and Mobile still inject nothing, so byok/managed publish on those
 *     surfaces continues to resolve to `{ kind: 'unavailable' }` — accurately.
 *   - Deletion IS implemented for the web adapter (unpublish, plus a management
 *     list in settings). Retention/TTL, per-user quota and abuse controls are
 *     still founder-pending for that adapter; they are a requirement ON the
 *     adapter, not a gate in this module.
 *
 * @module artifacts
 */

import {
  assertSurfaceCanSyncChats,
  assertGeneratedFileTrustBoundary,
  formatPrivacyModeLabel,
  type SourceSurface,
  type PrivacyMode,
  type ProviderMode,
  type GeneratedFileTrustBoundaryInput,
  type ComputeSession,
  type GeneratedFile,
  type ArtifactManifest,
} from '@agiworkforce/types';

const PRIVACY_MODE_BY_ORIGIN_SIGNAL = {
  local: 'local',
  byok: 'byok',
  managed: 'managed',
  Local: 'local',
  DirectByok: 'byok',
  ManagedGateway: 'managed',
  ManagedNative: 'managed',
} as const satisfies Record<PrivacyMode | ProviderMode, PrivacyMode>;

const ORIGIN_PRIVACY_PRECEDENCE = ['local', 'byok', 'managed'] as const;

/**
 * Reduce every boundary signal a host observed about an artifact's origin to
 * the one privacy mode the publish decision may use.
 *
 * Signals are privacy modes, provider modes, or unrecognized wire strings, in
 * no particular order. The most restrictive observed boundary wins, so a
 * client-side default of `managed` can never outrank an observed Local or BYOK
 * turn, and an empty (or entirely unrecognized) signal set resolves to
 * `undefined` — the honest "origin unknown" that {@link publishArtifact}
 * refuses to publish rather than guessing at.
 */
export function resolveOriginPrivacyMode(
  signals: readonly (string | null | undefined)[],
): PrivacyMode | undefined {
  const observed = new Set<PrivacyMode>();
  for (const signal of signals) {
    if (!signal) continue;
    const mode = (PRIVACY_MODE_BY_ORIGIN_SIGNAL as Record<string, PrivacyMode | undefined>)[signal];
    if (mode) observed.add(mode);
  }
  return ORIGIN_PRIVACY_PRECEDENCE.find((mode) => observed.has(mode));
}

export interface PublishableArtifact {
  id: string;
  title: string;
  content: string;
  type: string;
  language?: string;
}

export interface LocalPublishResult {
  kind: 'local';
  shareUrl: string;
  shareToken: string;
  publishedAt: string;
}

export interface CloudPublishResult {
  kind: 'cloud';
  shareUrl: string;
  publishedAt: string;
}

export interface CloudUnavailablePublishResult {
  kind: 'unavailable';
  shareUrl: null;
  reason: string;
}

export type PublishResult = LocalPublishResult | CloudPublishResult | CloudUnavailablePublishResult;

export interface PublishArtifactInput {
  artifact: PublishableArtifact;
  privacyMode: PrivacyMode;
  surface: SourceSurface;
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
  /**
   * The privacy mode the artifact was actually produced in, read from the
   * originating conversation/message trust-boundary labels rather than from
   * whatever the publish UI wants to do. Required for any cloud publish:
   * without it the boundary cannot be verified and the publish is refused.
   */
  originPrivacyMode?: PrivacyMode;
}

export type LocalFileWriter = (artifact: PublishableArtifact) => Promise<string>;

export type CloudPublisher = (
  artifact: PublishableArtifact,
  privacyMode: PrivacyMode,
) => Promise<{ shareUrl: string; publishedAt?: string }>;

function makeShareToken(artifactId: string, timestamp: string): string {
  const raw = `${artifactId}:${timestamp}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

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

function unavailable(reason: string): CloudUnavailablePublishResult {
  return { kind: 'unavailable', shareUrl: null, reason };
}

function cloudPublishDenial(
  requested: PrivacyMode,
  origin: PrivacyMode | undefined,
): CloudUnavailablePublishResult | null {
  if (!origin) {
    return unavailable(
      'Publishing is unavailable: the privacy mode this artifact was created in is unknown. Download the artifact instead.',
    );
  }
  if (origin !== 'managed') {
    return unavailable(
      `This artifact was created in ${formatPrivacyModeLabel(origin)} mode. Publishing uploads it to AGI managed cloud, so it is unavailable in this privacy mode. Download the artifact instead.`,
    );
  }
  if (requested !== origin) {
    return unavailable(
      `Publishing was requested in ${formatPrivacyModeLabel(requested)} mode, but this artifact was created in ${formatPrivacyModeLabel(origin)} mode. Download the artifact instead.`,
    );
  }
  return null;
}

/**
 * Publish an artifact.
 *
 * Enforces the chat-sync surface rule (CLI / VSCode / Chrome must not use
 * this path), the artifact's originating trust boundary (a Local or BYOK
 * artifact never reaches the managed-cloud publisher), and the generated-file
 * trust boundary before performing any I/O.
 *
 * @throws {Error} When surface is a developer-session surface.
 * @throws {Error} When the trust boundary is violated.
 * @throws {Error} When `privacyMode === 'local'` and no `localFileWriter` is
 *   supplied, or when the writer itself throws.
 * @throws {Error} When a supplied `cloudPublisher` throws, or returns no URL.
 */
export async function publishArtifact(input: PublishArtifactInput): Promise<PublishResult> {
  const { artifact, privacyMode, surface, localFileWriter, cloudPublisher } = input;

  assertSurfaceCanSyncChats(surface);

  if (privacyMode === 'byok' || privacyMode === 'managed') {
    const denial = cloudPublishDenial(privacyMode, input.originPrivacyMode);
    if (denial) return denial;

    if (!cloudPublisher) {
      return unavailable(
        'Cloud publish is not available on this surface yet. Download the artifact instead.',
      );
    }

    const published = await cloudPublisher(artifact, privacyMode);
    if (!published?.shareUrl) {
      throw new Error('publishArtifact: cloudPublisher resolved without a shareUrl.');
    }
    return {
      kind: 'cloud',
      shareUrl: published.shareUrl,
      publishedAt: published.publishedAt ?? new Date().toISOString(),
    };
  }

  if (!localFileWriter) {
    throw new Error(
      'publishArtifact: localFileWriter adapter is required when privacyMode is "local".',
    );
  }

  const fileUrl = await localFileWriter(artifact);

  const trustInput = buildTrustBoundaryInput(artifact, fileUrl);
  assertGeneratedFileTrustBoundary(trustInput);

  const publishedAt = new Date().toISOString();
  const shareToken = makeShareToken(artifact.id, publishedAt);

  return {
    kind: 'local',
    shareUrl: fileUrl,
    shareToken,
    publishedAt,
  };
}
