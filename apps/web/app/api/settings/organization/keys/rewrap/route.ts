import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { readIdempotencyKey, withIdempotentWrite } from '@/lib/server/idempotency';
import {
  readOrganizationKeyRecord,
  retireOrganizationKeyVersion,
  runOrganizationKeyRewrap,
} from '@/lib/server/organization-encryption-keys';
import type { RewrapOutcome } from '@/lib/crypto/cmek-lifecycle';
import { requireStepUp } from '@/lib/server/step-up-auth';
import {
  KEYS_ENDPOINT,
  requireKeyManagement,
} from '@/app/api/settings/organization/keys/keys-access';

export const runtime = 'nodejs';

/**
 * A rewrap walks every sealed store and can take several runs on a large
 * workspace, so the route is bounded by the module's own batch caps and is
 * safe to call again: each run resumes from what is still on the old version.
 */
export const maxDuration = 300;

const RewrapSchema = z
  .object({
    fromVersion: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, 'fromVersion is a key version'),
    retire: z.boolean().default(false),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export interface KeyRewrapResponse {
  outcome: RewrapOutcome;
  retired: boolean;
  retainedVersions: string[] | null;
}

async function handleRewrap(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-keys-rewrap');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await requireKeyManagement(
    request,
    'admin.policy.manage',
    'Your workspace role does not allow managing this workspace encryption key.',
  );

  const idempotencyKey = readIdempotencyKey(request);
  const parsed = RewrapSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid rewrap request', parsed.error.issues);
  }

  const record = await readOrganizationKeyRecord(db, organizationId);
  if (!record) {
    throw createError
      .notFound('This workspace manages no key of its own, so there is nothing to rewrap.')
      .asUserSafe();
  }
  if (!record.retired.some((key) => key.version === parsed.data.fromVersion)) {
    throw createError
      .validation('That key version is not in this workspace ring, so nothing is sealed under it.')
      .asUserSafe();
  }

  // Retirement is what drops the version out of the ring, so it is the half
  // that spends a factor. The rewrap alone only re-seals.
  if (parsed.data.retire) {
    if (!parsed.data.reason) {
      throw createError
        .validation('Retiring a key version needs a reason, which the trail records.')
        .asUserSafe();
    }
    await requireStepUp({
      userId,
      action: 'encryption_key.retire',
      resourceId: parsed.data.fromVersion,
      organizationId,
      request,
      endpoint: KEYS_ENDPOINT,
    });
  }

  const run = async () => {
    const privileged = getNeonDb();
    const outcome = await runOrganizationKeyRewrap({
      db: privileged,
      organizationId,
      actorUserId: userId,
      fromVersion: parsed.data.fromVersion,
    });

    if (!parsed.data.retire || !outcome.complete) {
      return {
        replayed: false,
        status: 200,
        body: { outcome, retired: false, retainedVersions: null },
      };
    }

    const retired = await retireOrganizationKeyVersion({
      db: privileged,
      organizationId,
      actorUserId: userId,
      keyVersion: parsed.data.fromVersion,
      reason: parsed.data.reason as string,
    });
    return {
      replayed: false,
      status: 200,
      body: { outcome, retired: true, retainedVersions: retired.retainedVersions },
    };
  };

  if (idempotencyKey === null) {
    const result = await run();
    return NextResponse.json(result.body, { status: result.status });
  }

  const result = await withIdempotentWrite<KeyRewrapResponse>(
    db,
    {
      organizationId,
      scope: 'organization-encryption-key:rewrap',
      actorId: userId,
      key: idempotencyKey,
      requestBody: {
        fromVersion: parsed.data.fromVersion,
        retire: parsed.data.retire,
        to: record.active.version,
      },
    },
    run,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Idempotency-Replayed': result.replayed ? 'true' : 'false' },
  });
}

export const POST = withErrorHandler(handleRewrap);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
