import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  WAITLIST_CONSENT_PURPOSES,
  PLATFORM_AVAILABILITY_CONSENT_PURPOSES,
  isConsentPurpose,
  recordConsentBatch,
  type ConsentDecision,
  type ConsentSurface,
  type ConsentPurpose,
} from '@/lib/server/consent-records';
import { getRequestIdentity } from '@/lib/server/identity';

type PublicWaitlistSource = 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other';

function requiredConsentPurposesForSource(source: PublicWaitlistSource): readonly ConsentPurpose[] {
  return source === 'other' ? PLATFORM_AVAILABILITY_CONSENT_PURPOSES : WAITLIST_CONSENT_PURPOSES;
}

const VALID_SOURCES = new Set<PublicWaitlistSource>([
  'website',
  'byok',
  'sync',
  'billing',
  'mobile',
  'other',
]);

function isValidSource(value: unknown): value is PublicWaitlistSource {
  return typeof value === 'string' && VALID_SOURCES.has(value as PublicWaitlistSource);
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

const WAITLIST_CONSENT_SURFACES = new Set<ConsentSurface>([
  'web-waitlist-inline',
  'web-waitlist-modal',
]);

function isWaitlistConsentSurface(value: unknown): value is ConsentSurface {
  return typeof value === 'string' && WAITLIST_CONSENT_SURFACES.has(value as ConsentSurface);
}

function parseConsentDecisions(value: unknown): ConsentDecision[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const decisions: ConsentDecision[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { purpose, granted } = entry as { purpose?: unknown; granted?: unknown };
    if (!isConsentPurpose(purpose) || typeof granted !== 'boolean') continue;
    if (seen.has(purpose)) {
      throw createError.validation(`Conflicting consent decisions for ${purpose}`);
    }
    seen.add(purpose);
    decisions.push({ purpose, granted });
  }
  return decisions;
}

async function getOptionalUserId(): Promise<string | null> {
  try {
    const { subject: userId } = await getRequestIdentity();
    return userId ?? null;
  } catch {
    return null;
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const payload = body as {
    email?: unknown;
    source?: unknown;
    consent?: unknown;
    consentSurface?: unknown;
  };

  if (!isValidEmail(payload.email)) {
    throw createError.validation('A valid email address is required');
  }

  const source: PublicWaitlistSource = isValidSource(payload.source) ? payload.source : 'website';
  const email = normalizeWaitlistEmail(payload.email as string);

  const consentSurface: ConsentSurface = isWaitlistConsentSurface(payload.consentSurface)
    ? payload.consentSurface
    : 'web-waitlist-inline';
  const decisions = parseConsentDecisions(payload.consent);
  const requiredPurposes = requiredConsentPurposesForSource(source);

  const decided = new Set(decisions.map((decision) => decision.purpose));
  const undecided = requiredPurposes.filter((purpose) => !decided.has(purpose.id));
  if (undecided.length > 0) {
    throw createError.validation(
      `A consent decision is required for: ${undecided.map((purpose) => purpose.id).join(', ')}`,
    );
  }

  const refusedRequired = requiredPurposes.filter(
    (purpose) =>
      purpose.necessaryForRequest &&
      !decisions.some((decision) => decision.purpose === purpose.id && decision.granted),
  );
  if (refusedRequired.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'CONSENT_REQUIRED',
          message:
            'We can only store your email address if you agree to it being stored for the early-access list.',
        },
      },
      { status: 400 },
    );
  }

  const userId = await getOptionalUserId();
  const db = getNeonDb();
  const now = new Date().toISOString();

  try {
    await recordConsentBatch(
      userId ? { kind: 'user', userId } : { kind: 'email', email },
      decisions,
      consentSurface,
    );
  } catch (err) {
    console.warn('[waitlist/public] Consent ledger unavailable; refusing signup.', { source });
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw createError.internal('Consent could not be recorded, so nothing was stored');
  }

  try {
    await db.execute(
      `insert into cloud_managed_waitlist (user_id, email, source, joined_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (email, source)
       do update set
         user_id = coalesce(excluded.user_id, cloud_managed_waitlist.user_id),
         updated_at = excluded.updated_at`,
      [userId, email, source, now, now],
    );
    return NextResponse.json({ ok: true, joined: true });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '42P01') {
      console.warn('[waitlist/public] Table not yet migrated; refusing signup.', { source });
      throw createError.internal('Cloud waitlist storage is not migrated');
    }
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.warn('[waitlist/public] DB unreachable; refusing signup.', { source });
    throw createError.internal('Cloud waitlist storage is unavailable');
  }
}

export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
