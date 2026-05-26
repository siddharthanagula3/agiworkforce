import 'server-only';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

/**
 * Hash an email address with SHA-256 before storage.
 * Emails are PII; they are not needed for display or notifications in this
 * route (userId is the canonical identifier). Only the hash is stored.
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

type WaitlistPlan = 'pro' | 'max';
type BillingInterval = 'monthly' | 'yearly';

function isWaitlistPlan(value: unknown): value is WaitlistPlan {
  return value === 'pro' || value === 'max';
}

function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

type WaitlistPlanRow = { plan: string };

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<WaitlistPlanRow>(
    'select distinct plan from waitlist where user_id = $1',
    [userId],
  );

  const joinedPlans = rows.map((row) => row.plan).filter(isWaitlistPlan);

  return NextResponse.json({ joinedPlans });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { userId, email } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const payload = body as {
    plan?: unknown;
    billingInterval?: unknown;
    source?: unknown;
  };

  if (!isWaitlistPlan(payload.plan)) {
    throw createError.validation('plan must be pro or max');
  }

  const billingInterval = isBillingInterval(payload.billingInterval)
    ? payload.billingInterval
    : ('yearly' as const);
  const source = typeof payload.source === 'string' ? payload.source.slice(0, 100) : 'pricing';
  // Hash the email before storage: the plaintext is not needed for dedup or
  // notifications in this route. userId is the unique key; email_hash lets
  // ops audit duplicate addresses without retaining cleartext PII.
  const emailHash = email != null ? hashEmail(email) : null;
  const db = getNeonDb();
  const now = new Date().toISOString();

  await db.execute(
    `insert into waitlist (user_id, email, plan, billing_interval, source, joined_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, plan)
     do update set
       email = excluded.email,
       billing_interval = excluded.billing_interval,
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [userId, emailHash, payload.plan, billingInterval, source, now, now],
  );

  return NextResponse.json({ ok: true, plan: payload.plan, joined: true });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
