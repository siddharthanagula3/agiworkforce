/**
 * Artifact publish helper.
 *
 * Cloud Managed — waitlist-gated. Persists generated-file bundles to the
 * `published_artifacts` Supabase table after asserting the trust boundary.
 *
 * In v1 LOCAL ONLY mode the table does not exist yet (migration ships in the
 * private beta). All calls will receive a 42P01 from Postgres, which is
 * surfaced as {@link ArtifactPersistenceUnavailableError} so the API route
 * can return 503 with a clean user-facing message.
 *
 * See: locks/v1-local-only-cloud-waitlist-2026-05-18.md
 */
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertGeneratedFileTrustBoundary,
  validateGeneratedFileTrustBoundary,
  type ComputeSession,
  type GeneratedFile,
  type ArtifactManifest,
  type GeneratedFileTransferEvidence,
  type GeneratedFileManagedEvidence,
  type GeneratedFileTrustBoundaryViolationCode,
} from '@agiworkforce/types';

const PG_UNDEFINED_TABLE = '42P01';

export class TrustBoundaryViolationError extends Error {
  readonly codes: GeneratedFileTrustBoundaryViolationCode[];
  constructor(codes: GeneratedFileTrustBoundaryViolationCode[], message: string) {
    super(message);
    this.name = 'TrustBoundaryViolationError';
    this.codes = codes;
    Object.setPrototypeOf(this, TrustBoundaryViolationError.prototype);
  }
}

export class ArtifactPersistenceUnavailableError extends Error {
  constructor() {
    super('Artifact persistence requires Cloud Managed (pending private beta migration)');
    this.name = 'ArtifactPersistenceUnavailableError';
    Object.setPrototypeOf(this, ArtifactPersistenceUnavailableError.prototype);
  }
}

export interface PublishArtifactInput {
  computeSession: ComputeSession;
  generatedFile: GeneratedFile;
  artifactManifest: ArtifactManifest;
  transfer?: GeneratedFileTransferEvidence;
  managed?: GeneratedFileManagedEvidence;
  userDb: SupabaseClient;
  userId: string;
}

export interface PublishArtifactResult {
  artifactId: string;
  manifestId: string;
  publishedAt: string;
}

export async function publishArtifact(input: PublishArtifactInput): Promise<PublishArtifactResult> {
  const { computeSession, generatedFile, artifactManifest, transfer, managed, userDb, userId } =
    input;

  const boundaryInput = { computeSession, generatedFile, artifactManifest, transfer, managed };

  try {
    assertGeneratedFileTrustBoundary(boundaryInput);
  } catch {
    const violations = validateGeneratedFileTrustBoundary(boundaryInput);
    const codes = violations.map((v) => v.code);
    const messages = violations.map((v) => `- ${v.code}: ${v.message}`).join('\n');
    throw new TrustBoundaryViolationError(
      codes,
      `AGI generated-file trust-boundary violation [${codes.join(', ')}]:\n${messages}`,
    );
  }

  const publishedAt = new Date().toISOString();
  const payload = {
    computeSession,
    generatedFile,
    artifactManifest,
    ...(transfer ? { transfer } : {}),
    ...(managed ? { managed } : {}),
  };

  const { data, error } = await userDb
    .from('published_artifacts')
    .upsert(
      {
        owner_user_id: userId,
        compute_session_id: computeSession.id,
        generated_file_id: generatedFile.id,
        artifact_manifest_id: artifactManifest.id,
        payload,
        privacy_mode: artifactManifest.privacyMode,
        provider_mode: artifactManifest.providerMode,
        source_surface: computeSession.sourceSurface,
        published_at: publishedAt,
      },
      { onConflict: 'compute_session_id,generated_file_id,artifact_manifest_id' },
    )
    .select('id, artifact_manifest_id, published_at')
    .single();

  if (error) {
    const pgError = error as unknown as { code?: string };
    if (pgError.code === PG_UNDEFINED_TABLE) {
      throw new ArtifactPersistenceUnavailableError();
    }
    throw new Error(`Failed to persist artifact: ${error.message}`);
  }

  return {
    artifactId: (data as { id: string }).id,
    manifestId: artifactManifest.id,
    publishedAt: (data as { published_at: string }).published_at ?? publishedAt,
  };
}
