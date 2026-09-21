import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MobileIapCatalogResponse } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { getMobileIapCatalogState } from '@/lib/server/mobile-iap-catalog';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import {
  WAITLIST_ACCESS_REQUIRED_CODE,
  hasBillingWaitlistAccess,
  hasPaidBillingHistory,
} from '@/lib/server/billing-waitlist-access';
import type { SubscriptionRow } from '@/lib/server/neon-types';

const QuerySchema = z.object({ platform: z.enum(['ios', 'android']) });
const MOBILE_SURFACE = 'mobile';
const PURCHASES_SWITCHED_OFF =
  'In-app purchases are temporarily switched off. Nothing was charged.';
const UPGRADE_ACCESS_REQUIRED =
  'Paid upgrades are opening in stages. This account needs upgrade access before plans and credits can be bought here.';

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
  const gate = catalog.enabled
    ? await readKillSwitchGate(
        buildFlagSubject(request, {
          userId,
          workspaceId: null,
          role: null,
          plan: null,
          surface: MOBILE_SURFACE,
        }),
      )
    : null;
  const switchedOff = gate !== null && !gate.capabilityAllowed('in_app_purchase');
  if (!catalog.enabled || switchedOff) {
    return NextResponse.json({
      enabled: false,
      platform: parsed.data.platform,
      appAccountToken: null,
      products: [],
      unavailableReason: switchedOff ? PURCHASES_SWITCHED_OFF : catalog.unavailableReason,
      unavailableCode: null,
    });
  }

  const db = getNeonDb();

  type SubRow = Pick<
    SubscriptionRow,
    | 'plan_tier'
    | 'status'
    | 'stripe_subscription_id'
    | 'apple_original_transaction_id'
    | 'google_purchase_token'
  >;
  let purchaseAllowed: boolean;
  try {
    const { db: ownRows } = await getUserScopedDb(request, { resolveOrganization: false });
    const subRows = await ownRows.query<SubRow>(
      `select plan_tier, status, stripe_subscription_id,
              apple_original_transaction_id, google_purchase_token
         from subscriptions where user_id = $1 limit 1`,
      [userId],
    );
    purchaseAllowed =
      hasPaidBillingHistory(subRows[0] ?? null) ||
      (await hasBillingWaitlistAccess(ownRows, userId));
  } catch (error) {
    logger.error(
      { error, userId },
      'Failed to verify paid upgrade access for the purchase catalogue',
    );
    throw createError.serviceUnavailable(
      'Upgrade access could not be verified. No purchase was started; please retry.',
    );
  }
  if (!purchaseAllowed) {
    return NextResponse.json({
      enabled: false,
      platform: parsed.data.platform,
      appAccountToken: null,
      products: [],
      unavailableReason: UPGRADE_ACCESS_REQUIRED,
      unavailableCode: WAITLIST_ACCESS_REQUIRED_CODE,
    });
  }

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
    unavailableCode: null,
  });
}

export const GET = withErrorHandler(handleCatalog);
