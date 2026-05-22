/**
 * POST /api/artifacts/publish
 *
 * Cloud Managed — waitlist-gated pending private beta migration.
 * In v1 LOCAL ONLY mode this route will always 503 because the
 * `published_artifacts` table does not exist yet.
 *
 * See: locks/v1-local-only-cloud-waitlist-2026-05-18.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';
import {
  publishArtifact,
  TrustBoundaryViolationError,
  ArtifactPersistenceUnavailableError,
} from '@/lib/artifact-publisher';
import {
  PRIVACY_MODES,
  PROVIDER_MODES,
  type ComputeSession,
  type GeneratedFile,
  type ArtifactManifest,
  type GeneratedFileTransferEvidence,
  type GeneratedFileManagedEvidence,
} from '@agiworkforce/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateComputeSession(v: unknown): v is ComputeSession {
  if (!isRecord(v)) return false;
  if (!isString(v['id'])) return false;
  if (!isString(v['ownerUserId'])) return false;
  if (!isString(v['sourceSurface'])) return false;
  if (!(PRIVACY_MODES as readonly string[]).includes(v['privacyMode'] as string)) return false;
  if (!(PROVIDER_MODES as readonly string[]).includes(v['providerMode'] as string)) return false;
  if (!isString(v['status'])) return false;
  if (!isString(v['workdirUri'])) return false;
  if (!isString(v['createdAt'])) return false;
  if (!isString(v['updatedAt'])) return false;
  return true;
}

function validateGeneratedFile(v: unknown): v is GeneratedFile {
  if (!isRecord(v)) return false;
  if (!isString(v['id'])) return false;
  if (!isString(v['computeSessionId'])) return false;
  if (!isString(v['ownerUserId'])) return false;
  if (!isString(v['sourceSurface'])) return false;
  if (!(PRIVACY_MODES as readonly string[]).includes(v['privacyMode'] as string)) return false;
  if (!(PROVIDER_MODES as readonly string[]).includes(v['providerMode'] as string)) return false;
  if (!isString(v['kind'])) return false;
  if (!isString(v['fileName'])) return false;
  if (!isString(v['mimeType'])) return false;
  if (!isString(v['uri'])) return false;
  if (typeof v['byteCount'] !== 'number') return false;
  if (!isString(v['checksumSha256'])) return false;
  if (!Array.isArray(v['previewDerivatives'])) return false;
  if (!isString(v['createdAt'])) return false;
  return true;
}

function validateArtifactManifest(v: unknown): v is ArtifactManifest {
  if (!isRecord(v)) return false;
  if (!isString(v['id'])) return false;
  if (!isString(v['artifactId'])) return false;
  if (!isString(v['type'])) return false;
  if (!isString(v['title'])) return false;
  if (!Array.isArray(v['generatedFileIds'])) return false;
  if (!(PRIVACY_MODES as readonly string[]).includes(v['privacyMode'] as string)) return false;
  if (!(PROVIDER_MODES as readonly string[]).includes(v['providerMode'] as string)) return false;
  if (!isString(v['storageScope'])) return false;
  if (!isString(v['createdAt'])) return false;
  if (!isString(v['updatedAt'])) return false;
  return true;
}

async function handlePublishArtifact(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { user, userDb } = await getAuthenticatedUserWithClient(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!isRecord(body)) {
    throw createError.validation('Request body must be an object');
  }

  if (!validateComputeSession(body['computeSession'])) {
    throw createError.validation('computeSession is missing or invalid');
  }
  if (!validateGeneratedFile(body['generatedFile'])) {
    throw createError.validation('generatedFile is missing or invalid');
  }
  if (!validateArtifactManifest(body['artifactManifest'])) {
    throw createError.validation('artifactManifest is missing or invalid');
  }

  const transfer = isRecord(body['transfer'])
    ? (body['transfer'] as unknown as GeneratedFileTransferEvidence)
    : undefined;
  const managed = isRecord(body['managed'])
    ? (body['managed'] as unknown as GeneratedFileManagedEvidence)
    : undefined;

  const computeSession = body['computeSession'] as ComputeSession;
  if (computeSession.ownerUserId !== user.id) {
    throw createError.forbidden('Cannot publish artifacts owned by another user');
  }

  try {
    const result = await publishArtifact({
      computeSession,
      generatedFile: body['generatedFile'] as GeneratedFile,
      artifactManifest: body['artifactManifest'] as ArtifactManifest,
      transfer,
      managed,
      userDb,
      userId: user.id,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof TrustBoundaryViolationError) {
      return NextResponse.json(
        {
          code: 'trust-boundary-violation',
          codes: err.codes,
          message: err.message,
        },
        { status: 400 },
      );
    }
    if (err instanceof ArtifactPersistenceUnavailableError) {
      return NextResponse.json(
        {
          error: 'artifact_persistence_unavailable',
          message: 'Artifact persistence requires Cloud Managed (pending private beta migration)',
        },
        { status: 503 },
      );
    }
    throw err;
  }
}

export const POST = withErrorHandler(handlePublishArtifact);
