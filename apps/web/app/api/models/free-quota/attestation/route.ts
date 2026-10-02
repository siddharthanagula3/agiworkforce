import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  FreeQuotaAttestationRequestSchema,
  type FreeQuotaAttestationReceipt,
  type FreeQuotaAttestationStatus,
  type FreeQuotaBlockedOutcome,
  type FreeQuotaTermsReviewStatus,
} from '@agiworkforce/cloud-contracts';
import { getProviderOffering } from '@agiworkforce/types';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  loadFreePools,
  termsReviewStanding,
  type FreeQuotaTermsReview,
} from '@/lib/server/free-pools';
import {
  QuotaAttestationSchema,
  UNREADABLE_SUSPENSION_AT_MS,
  attestationFreshUntilMs,
  attestationStanding,
  credentialSha256,
  quotaCredentialMatches,
  readFreeQuotaState,
  writeQuotaAttestation,
  type FreeQuotaPolicy,
  type QuotaAttestation,
} from '@/lib/free-quota-authorization';
import {
  freeQuotaContextFor,
  loadFreeQuotaPolicy,
  resolveFreeQuotaDecisions,
  sharedFreeQuotaStore,
  type FreeQuotaDecisions,
} from '@/lib/server/free-quota-catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * How stale a console check may be when it is recorded. It is separate from how
 * long a recorded check stays valid: the switch does not flip on its own, but a
 * check read days ago says nothing about the console now.
 */
const CONSOLE_CHECK_RECORD_WINDOW_MS = 60 * 60 * 1000;

function operatorRefusal(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status, headers: NO_STORE });
}

function currentKey(): string {
  return process.env['QWEN_API_KEY'] ?? '';
}

function recordWindowMs(policy: FreeQuotaPolicy): number {
  return Math.min(policy.attestationMaxAgeMs, CONSOLE_CHECK_RECORD_WINDOW_MS);
}

function coveredCount(offerings: QuotaAttestation['quotaOnlyOfferings']): 'all' | number {
  return offerings === 'all' ? 'all' : offerings.length;
}

function covers(attestation: QuotaAttestation | null, offeringKey: string): boolean {
  if (!attestation) return false;
  return (
    attestation.quotaOnlyOfferings === 'all' || attestation.quotaOnlyOfferings.includes(offeringKey)
  );
}

type ConfiguredStatus = Extract<FreeQuotaAttestationStatus, { configured: true }>;

function termsReviewStatus(
  review: FreeQuotaTermsReview | null,
  policy: FreeQuotaPolicy,
  nowMs: number,
): FreeQuotaTermsReviewStatus {
  return {
    standing: termsReviewStanding(review, nowMs, policy.termsReviewReminderLeadMs),
    review: review
      ? {
          reviewedBy: review.reviewedBy,
          verifiedAtMs: review.verifiedAtMs,
          expiresAtMs: review.expiresAtMs,
          evidenceUrl: review.evidenceUrl,
          terms: review.terms,
          approvedOfferings: review.approvedOfferingKeys.length,
        }
      : null,
  };
}

function attestableOfferings(
  decisions: FreeQuotaDecisions | null,
  attestation: QuotaAttestation | null,
): ConfiguredStatus['offerings'] {
  return (decisions?.offerings ?? []).flatMap(({ entry, offering, decision }) => {
    if (
      decision.status === 'expired' ||
      !entry.quotaOnlyObserved ||
      offering.identityStatus !== 'exact' ||
      !offering.providerModelId ||
      !offering.quotaProbeProtocol
    ) {
      return [];
    }
    return [
      {
        key: entry.offeringKey,
        displayName: offering.displayName,
        providerModelId: offering.providerModelId,
        category: offering.category,
        expiresOn: entry.expiresOn,
        attested: covers(attestation, entry.offeringKey),
      },
    ];
  });
}

function servingSummary(decisions: FreeQuotaDecisions | null): ConfiguredStatus['serving'] {
  const offerings = decisions?.offerings ?? [];
  const blocked = new Map<FreeQuotaBlockedOutcome, number>();
  let ready = 0;
  for (const { decision } of offerings) {
    if (decision.status === 'ready') {
      ready += 1;
      continue;
    }
    const outcome = decision.status === 'unavailable' ? decision.reason : decision.status;
    blocked.set(outcome, (blocked.get(outcome) ?? 0) + 1);
  }
  return {
    ready,
    total: offerings.length,
    blocked: [...blocked]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((left, right) => right.count - left.count),
  };
}

function statusResponse(body: FreeQuotaAttestationStatus): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const store = sharedFreeQuotaStore(process.env.NODE_ENV);
  const inventory = loadFreePools().inventory;
  const apiKey = currentKey();
  if (!store || !inventory || !apiKey) {
    return statusResponse({
      configured: false,
      sharedState: Boolean(store),
      credential: Boolean(apiKey),
      inventory: Boolean(inventory),
    });
  }
  const policy = loadFreeQuotaPolicy();
  const nowMs = Date.now();
  const [state, decisions] = await Promise.all([
    readFreeQuotaState(store, { apiKey, observedOn: inventory.observedOn, offeringKeys: [] }),
    resolveFreeQuotaDecisions(freeQuotaContextFor({ url: request.url, userId, nowMs }), {
      inventory,
    }),
  ]);
  const { attestation } = state;
  const billingSignalUnreadable = state.suspendedAtMs === UNREADABLE_SUSPENSION_AT_MS;
  return statusResponse({
    configured: true,
    nowMs,
    issuer: inventory.issuer,
    consolePage: QuotaAttestationSchema.shape.sourceUrl.value,
    validForMs: policy.attestationMaxAgeMs,
    recordWindowMs: recordWindowMs(policy),
    consoleCheckReminderLeadMs: policy.attestationReminderLeadMs,
    termsReviewReminderLeadMs: policy.termsReviewReminderLeadMs,
    termsReview: termsReviewStatus(inventory.termsReview, policy, nowMs),
    attestation: {
      standing: attestationStanding({ state, apiKey, policy, nowMs }).standing,
      record: attestation
        ? {
            checkedAtMs: attestation.checkedAtMs,
            freshUntilMs: attestationFreshUntilMs(attestation.checkedAtMs, policy),
            offerings: coveredCount(attestation.quotaOnlyOfferings),
            boundToCurrentKey: quotaCredentialMatches(attestation, apiKey),
            attestedBy: attestation.attestedBy,
          }
        : null,
    },
    billingSignalAtMs: billingSignalUnreadable ? null : state.suspendedAtMs,
    billingSignalUnreadable,
    withdrawn: [...state.holds].map(([key, cause]) => ({
      key,
      displayName: getProviderOffering(key)?.displayName ?? key,
      cause,
    })),
    offerings: attestableOfferings(decisions, attestation),
    serving: servingSummary(decisions),
  });
}

async function handlePost(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = FreeQuotaAttestationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return operatorRefusal(
      'Send checkedAtMs ("now", or when the check was made in epoch milliseconds) and quotaOnlyOfferings ("all" for every model listed now, or a list of offering keys).',
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
  const { quotaOnlyOfferings } = parsed.data;
  const checkedAtMs = parsed.data.checkedAtMs === 'now' ? nowMs : parsed.data.checkedAtMs;
  if (checkedAtMs > nowMs || nowMs - checkedAtMs >= recordWindowMs(policy)) {
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
  const covered =
    quotaOnlyOfferings === 'all'
      ? attestableOfferings(
          await resolveFreeQuotaDecisions(
            freeQuotaContextFor({ url: request.url, userId, nowMs }),
            { inventory },
          ),
          null,
        ).map((offering) => offering.key)
      : quotaOnlyOfferings;
  if (covered.length === 0) {
    return operatorRefusal(
      'No free quota inventory model can be served from the free quota now, so there is nothing to record.',
      'attestation_nothing_to_cover',
      400,
    );
  }

  await writeQuotaAttestation(store, {
    sourceUrl: QuotaAttestationSchema.shape.sourceUrl.value,
    checkedAtMs,
    credentialSha256: credentialSha256(apiKey),
    quotaOnlyOfferings: covered,
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
      scopes: covered,
    },
  });

  const receipt: FreeQuotaAttestationReceipt = {
    checkedAtMs,
    freshUntilMs: attestationFreshUntilMs(checkedAtMs, policy),
    offerings: covered.length,
  };
  return NextResponse.json(receipt, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
