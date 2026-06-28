/**
 * POST /api/artifacts/publish
 *
 * Cloud Managed · managed artifact publishing is rolling out as sharing
 * controls are proven. Managed cloud access itself is public-alpha-open.
 *
 * Until managed artifact publishing is proven, this route returns 200 with
 * `{ kind: 'waitlist', shareUrl: null, waitlistGated: true }`.
 * The previous 503 path (ArtifactPersistenceUnavailableError) is gone;
 * the publisher now returns a clean discriminated union instead of throwing.
 *
 * See the current product source of truth before changing this gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { publishArtifact, TrustBoundaryViolationError } from '@/lib/artifact-publisher';
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

  const { userId } = await getClerkAuthUser(request);

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
  if (computeSession.ownerUserId !== userId) {
    throw createError.forbidden('Cannot publish artifacts owned by another user');
  }

  try {
    const result = await publishArtifact({
      computeSession,
      generatedFile: body['generatedFile'] as GeneratedFile,
      artifactManifest: body['artifactManifest'] as ArtifactManifest,
      transfer,
      managed,
    });
    // kind='waitlist' is the current public web result; kind='local' would be
    // Desktop-only. Both are valid 200 responses from this route.
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
    throw err;
  }
}

export const POST = withErrorHandler(handlePublishArtifact);
