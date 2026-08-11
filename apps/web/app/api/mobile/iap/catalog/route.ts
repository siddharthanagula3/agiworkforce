import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MobileIapCatalogResponse } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getMobileIapCatalogState } from '@/lib/server/mobile-iap-catalog';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';

const QuerySchema = z.object({ platform: z.enum(['ios', 'android']) });

async function handleCatalog(
  request: NextRequest,
): Promise<NextResponse<MobileIapCatalogResponse>> {
  const rateLimitResponse = await withRateLimit(request, 'mobile-iap-catalog');
  if (rateLimitResponse) return rateLimitResponse as NextResponse<MobileIapCatalogResponse>;

  const userId = await requireCurrentUserId(request);
  const parsed = QuerySchema.safeParse({
    platform: new URL(request.url).searchParams.get('platform'),
  });
  if (!parsed.success) throw createError.badRequest('platform must be ios or android');

  const catalog = getMobileIapCatalogState(parsed.data.platform);
  if (!catalog.enabled) {
    return NextResponse.json({
      enabled: false,
      platform: parsed.data.platform,
      appAccountToken: null,
      products: [],
      unavailableReason: catalog.unavailableReason,
    });
  }

  const db = getNeonDb();
  const [readiness] = await db.query<{ ready: boolean }>(
    `select (
       to_regclass('public.mobile_iap_accounts') is not null
       and to_regclass('public.mobile_iap_transactions') is not null
       and to_regclass('public.mobile_iap_notification_receipts') is not null
       and to_regprocedure('public.handle_top_up_refund(text,integer,text)') is not null
     ) as ready`,
  );
  if (readiness?.ready !== true) {
    throw createError.serviceUnavailable(
      'Native purchase storage is being prepared. No purchase was started.',
    );
  }

  const [account] = await db.query<{ app_account_token: string }>(
    `insert into public.mobile_iap_accounts (user_id)
     values ($1)
     on conflict (user_id) do update set updated_at = now()
     returning app_account_token`,
    [userId],
  );
  if (!account?.app_account_token) {
    throw createError.internal('Unable to bind this store purchase to your account.');
  }

  return NextResponse.json({
    enabled: true,
    platform: parsed.data.platform,
    appAccountToken: account.app_account_token,
    products: catalog.products,
    unavailableReason: null,
  });
}

export const GET = withErrorHandler(handleCatalog);
