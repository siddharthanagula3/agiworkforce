/**
 * Artifact publish helper · web surface adapter.
 *
 * Web publish boundary:
 *
 * Web has no local filesystem. Cloud publish is waitlist-gated because managed
 * artifact publishing is not proven for public use yet.
 *
 * This adapter always returns a clean {@link WaitlistPublishResult} instead of
 * attempting any network call or DB upsert. The previous implementation threw
 * `ArtifactPersistenceUnavailableError` on 42P01, which caused 503s in
 * production. That error class is gone; the route now receives a discriminated
 * union and returns 200 with kind='waitlist'.
 *
 * See the current product source of truth before changing this gate.
 */
import 'server-only';

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

import type { PublishResult, WaitlistPublishResult } from '@agiworkforce/services';

export type { PublishResult, WaitlistPublishResult };

export class TrustBoundaryViolationError extends Error {
  readonly codes: GeneratedFileTrustBoundaryViolationCode[];
  constructor(codes: GeneratedFileTrustBoundaryViolationCode[], message: string) {
    super(message);
    this.name = 'TrustBoundaryViolationError';
    this.codes = codes;
    Object.setPrototypeOf(this, TrustBoundaryViolationError.prototype);
  }
}

export interface PublishArtifactInput {
  computeSession: ComputeSession;
  generatedFile: GeneratedFile;
  artifactManifest: ArtifactManifest;
  transfer?: GeneratedFileTransferEvidence;
  managed?: GeneratedFileManagedEvidence;
}

/**
 * Publish an artifact from the web surface.
 *
 * Enforces the generated-file trust boundary before returning the waitlist
 * result. No DB call is made. Returns `{ kind: 'waitlist', shareUrl: null,
 * waitlistGated: true }` for all inputs that pass the boundary check.
 *
 * @throws {TrustBoundaryViolationError} When the generated-file trust boundary
 *   is violated (mismatched session IDs, wrong privacy/provider mode, etc.).
 */
export async function publishArtifact(input: PublishArtifactInput): Promise<PublishResult> {
  const { computeSession, generatedFile, artifactManifest, transfer, managed } = input;

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

  // Web has no local filesystem; cloud publish is waitlist-gated.
  // Return clean discriminated union · no DB upsert, no network call.
  const result: WaitlistPublishResult = {
    kind: 'waitlist',
    shareUrl: null,
    waitlistGated: true,
  };
  return result;
}
