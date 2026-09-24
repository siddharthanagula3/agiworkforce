import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { loadFreePools } from '@/lib/server/free-pools';
import {
  QuotaAttestationSchema,
  credentialSha256,
  quotaCredentialMatches,
  readFreeQuotaState,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreeQuotaPolicy, sharedFreeQuotaStore } from '@/lib/server/free-quota-catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * How stale a console check may be when it is recorded. It is separate from how
 * long a recorded check stays valid: the switch does not flip on its own, but a
 * check read days ago says nothing about the console now.
 */
const CONSOLE_CHECK_RECORD_WINDOW_MS = 60 * 60 * 1000;

const AttestationRequestSchema = QuotaAttestationSchema.pick({
  checkedAtMs: true,
  quotaOnlyOfferings: true,
});

function operatorRefusal(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status, headers: NO_STORE });
}

function currentKey(): string {
  return process.env['QWEN_API_KEY'] ?? '';
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const store = sharedFreeQuotaStore(process.env.NODE_ENV);
  const inventory = loadFreePools().inventory;
  const apiKey = currentKey();
  if (!store || !inventory || !apiKey) {
    return NextResponse.json(
      { configured: false, sharedState: Boolean(store), credential: Boolean(apiKey) },
      { headers: NO_STORE },
    );
  }
  const policy = loadFreeQuotaPolicy();
  const state = await readFreeQuotaState(store, {
    apiKey,
    observedOn: inventory.observedOn,
    offeringKeys: [],
  });
  const attestation = state.attestation;
  return NextResponse.json(
    {
      configured: true,
      attestation: attestation
        ? {
            checkedAtMs: attestation.checkedAtMs,
            freshUntilMs: attestation.checkedAtMs + policy.attestationMaxAgeMs,
            boundToCurrentKey: quotaCredentialMatches(attestation, apiKey),
            offerings:
              attestation.quotaOnlyOfferings === 'all'
                ? 'all'
                : attestation.quotaOnlyOfferings.length,
            attestedBy: attestation.attestedBy,
          }
        : null,
      billingSignalAtMs: state.suspendedAtMs,
      withdrawnOfferings: [...state.holds.keys()],
    },
    { headers: NO_STORE },
  );
}

async function handlePost(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = AttestationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return operatorRefusal(
      'Send checkedAtMs and quotaOnlyOfferings ("all" or a list of offering keys).',
      'invalid_attestation',
      400,
    );
  }
  const inventory = loadFreePools().inventory;
  const store = sharedFreeQuotaStore(process.env.NODE_ENV);
  const apiKey = currentKey();
  if (!inventory || !store || !apiKey) {
    return operatorRefusal(
      'The free quota inventory, the shared state store and the provider key must all be configured first.',
      'free_quota_not_configured',
      503,
    );
  }
  const policy = loadFreeQuotaPolicy();
  const nowMs = Date.now();
  const { checkedAtMs, quotaOnlyOfferings } = parsed.data;
  const recordWindowMs = Math.min(policy.attestationMaxAgeMs, CONSOLE_CHECK_RECORD_WINDOW_MS);
  if (checkedAtMs > nowMs || nowMs - checkedAtMs >= recordWindowMs) {
    return operatorRefusal(
      'Record the console check within an hour of making it, and never with a time in the future.',
      'attestation_out_of_window',
      400,
    );
  }
  const known = new Set(inventory.entries.map((entry) => entry.offeringKey));
  if (quotaOnlyOfferings !== 'all' && quotaOnlyOfferings.some((key) => !known.has(key))) {
    return operatorRefusal(
      'Every attested offering must be in the free quota inventory.',
      'attestation_unknown_offering',
      400,
    );
  }

  await writeQuotaAttestation(store, {
    sourceUrl: QuotaAttestationSchema.shape.sourceUrl.value,
    checkedAtMs,
    credentialSha256: credentialSha256(apiKey),
    quotaOnlyOfferings,
    attestedBy: userId,
  });
  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    severity: 'warning',
    request,
    detail: {
      resourceType: 'free_quota_attestation',
      resourceId: new Date(checkedAtMs).toISOString(),
      scopes: quotaOnlyOfferings === 'all' ? ['all'] : quotaOnlyOfferings,
    },
  });

  return NextResponse.json(
    {
      checkedAtMs,
      freshUntilMs: checkedAtMs + policy.attestationMaxAgeMs,
      offerings: quotaOnlyOfferings === 'all' ? 'all' : quotaOnlyOfferings.length,
    },
    { headers: NO_STORE },
  );
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
