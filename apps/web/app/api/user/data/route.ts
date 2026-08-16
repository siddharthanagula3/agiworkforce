import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseUserAccountData, eraseUserMedia } from '@/lib/server/account-erasure';
import { GET as exportUserDataGet } from '@/app/api/user/export/route';
import { CONTACT_EMAIL } from '@/lib/legal-constants';

export const GET = exportUserDataGet;

async function handleDeleteUserData(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { userId } = await getClerkAuthUser(request);
    const db = getNeonDb();

    logger.info(
      {
        userId,
        action: 'gdpr_data_deletion_requested',
      },
      'User requested GDPR data deletion',
    );

    let durableVideoSchemaProvisioned = true;
    try {
      const schema = await db.query<{ provisioned: boolean }>(
        `select to_regclass('public.video_generation_jobs') is not null as provisioned`,
      );
      durableVideoSchemaProvisioned = schema[0]?.provisioned === true;
    } catch (error) {
      logger.error(
        { userId, error },
        'Could not inspect durable video schema; bypassing legacy GDPR function',
      );
    }

    let rpcSucceeded = false;
    let rpcData: unknown = null;

    if (!durableVideoSchemaProvisioned) {
      try {
        const rows = await db.query<Record<string, unknown>>('select * from delete_user_data($1)', [
          userId,
        ]);
        rpcData = rows[0] ?? null;
        rpcSucceeded =
          (rpcData as Record<string, unknown> | null | undefined)?.['success'] === true;
        if (!rpcSucceeded) {
          logger.warn(
            { userId, result: rpcData },
            'Legacy GDPR function declined erasure; using canonical lifecycle-safe path',
          );
        }
      } catch (err: unknown) {
        const pgErr = err as { code?: string; message?: string };
        const isMissingFn =
          pgErr.code === '42883' ||
          pgErr.message?.includes('function') ||
          pgErr.message?.includes('does not exist');

        if (!isMissingFn) {
          logger.error({ err, userId }, 'Failed to delete user data via RPC');
          throw createError.internal('Failed to delete user data', pgErr.message ?? String(err));
        }

        logger.warn({ userId }, 'delete_user_data function not found, using fallback');
      }
    }

    if (rpcSucceeded) {
      const mediaErasure = await eraseUserMedia(userId);
      if (mediaErasure.mediaObjectsFailed > 0) {
        logger.error(
          { userId, mediaErasure },
          'Stored media could not be fully deleted during GDPR erasure',
        );
        throw createError.internal(
          `Your database records were deleted but some stored files could not be removed. Please contact ${CONTACT_EMAIL}.`,
        );
      }

      logger.info({ userId, result: rpcData }, 'User data deleted successfully via RPC');

      return NextResponse.json(
        {
          success: true,
          message: 'Your data has been successfully deleted.',
          user_id: userId,
          deletion_timestamp: new Date().toISOString(),
          details: { rpc: rpcData, media: mediaErasure },
          note: 'To complete account deletion, please also delete your authentication account through account settings.',
        },
        {
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    const erasure = await eraseUserAccountData(userId, {
      retainProfile: true,
      scope: 'data',
    });

    logger.info({ userId, erasure }, 'Completed fallback data deletion');

    if (!erasure.complete) {
      return NextResponse.json(
        {
          success: false,
          message: `Your data deletion request was only partially completed. Please contact ${CONTACT_EMAIL} so the remainder can be erased.`,
          user_id: userId,
          deletion_timestamp: new Date().toISOString(),
          details: erasure,
        },
        {
          status: 500,
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Your data deletion request has been processed and your data has been deleted.',
        user_id: userId,
        deletion_timestamp: new Date().toISOString(),
        details: erasure,
        note: 'To complete account deletion, please also delete your authentication account through account settings.',
      },
      {
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in DELETE /api/user/data',
    );
    throw error;
  }
}

export const DELETE = withErrorHandler(handleDeleteUserData);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
