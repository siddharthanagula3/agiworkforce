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
