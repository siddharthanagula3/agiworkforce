import {
  PUBLIC_WAITLIST_PATH,
  PublicWaitlistJoinResponseSchema,
  PublicWaitlistTokenResponseSchema,
} from '@agiworkforce/cloud-contracts/waitlist';
import type { InviteCodeError } from '@shared/components/cloud-bridge/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { isWaitlistSource, type ConsentDecision } from '@/lib/consent-purposes';

export interface RedeemInviteResult {
  success: boolean;
  inviteId?: string;
  error?: InviteCodeError;
}

export interface WaitlistEntry {
  email: string;
  name?: string;
  referralSource?: string;
  consent?: ConsentDecision[];
  consentSurface?: 'web-waitlist-inline' | 'web-waitlist-modal';
}

export interface JoinWaitlistResult {
  success: boolean;
  error?: string;
  rank?: number;
}

function toInviteCodeError(value: unknown): InviteCodeError {
  if (
    value === 'invalid_code' ||
    value === 'expired' ||
    value === 'fully_redeemed' ||
    value === 'already_redeemed_by_user' ||
    value === 'anon_signin_failed' ||
    value === 'rpc_error'
  ) {
    return value;
  }

  const message = typeof value === 'string' ? value.toLowerCase() : '';
  if (message.includes('invalid')) return 'invalid_code';
  if (message.includes('expired')) return 'expired';
  if (message.includes('fully') || message.includes('maximum')) return 'fully_redeemed';
  if (message.includes('already')) return 'already_redeemed_by_user';
  return 'rpc_error';
}

export async function redeemInviteCode(code: string, source: string): Promise<RedeemInviteResult> {
  void source;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/claim-offer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string | { code?: string; message?: string };
      };
      const error =
        typeof body.error === 'object' ? (body.error.code ?? body.error.message) : body.error;
      return { success: false, error: toInviteCodeError(error) };
    }

    const data = (await res.json()) as {
      success?: boolean;
      inviteId?: string;
      invite_id?: string;
      error?: string;
    };

    if (data.success) {
      return { success: true, inviteId: data.inviteId ?? data.invite_id ?? undefined };
    }

    return { success: false, error: toInviteCodeError(data.error) };
  } catch {
    return { success: false, error: 'rpc_error' };
  }
}

const JOIN_FAILED_MESSAGE = 'Failed to join waitlist. Please try again.';
const PUBLIC_WAITLIST_TOKEN_DEADLINE_MS = 10_000;

// The public waitlist is served without identity, so its token comes from the same route and
// is bound to the anonymous session. The token /api/csrf mints for a signed-in visitor is
// bound to the user id and is refused there.
async function fetchPublicWaitlistToken(): Promise<string> {
  const res = await fetch(PUBLIC_WAITLIST_PATH, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(PUBLIC_WAITLIST_TOKEN_DEADLINE_MS),
  });
  if (!res.ok) {
    throw new Error(`Public waitlist token request failed (${res.status})`);
  }
  return PublicWaitlistTokenResponseSchema.parse(await res.json()).token;
}

export async function joinPublicWaitlist(entry: WaitlistEntry): Promise<JoinWaitlistResult> {
  try {
    const source = isWaitlistSource(entry.referralSource) ? entry.referralSource : 'website';

    const headers = await addCsrfHeaders(
      { 'Content-Type': 'application/json' },
      await fetchPublicWaitlistToken(),
    );
    const res = await fetch(PUBLIC_WAITLIST_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        source,
        consent: entry.consent ?? [],
        consentSurface: entry.consentSurface ?? 'web-waitlist-inline',
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string } | string;
      } | null;
      const message =
        typeof body?.error === 'object' && typeof body.error?.message === 'string'
          ? body.error.message
          : JOIN_FAILED_MESSAGE;
      return { success: false, error: message };
    }

    const stored = PublicWaitlistJoinResponseSchema.safeParse(await res.json().catch(() => null));
    if (!stored.success) {
      return { success: false, error: JOIN_FAILED_MESSAGE };
    }

    return { success: true };
  } catch {
    return { success: false, error: JOIN_FAILED_MESSAGE };
  }
}

export async function joinWaitlist(entry: WaitlistEntry): Promise<JoinWaitlistResult> {
  try {
    const allowedSources = new Set(['byok', 'sync', 'billing', 'mobile', 'other']);
    const source =
      entry.referralSource && allowedSources.has(entry.referralSource)
        ? entry.referralSource
        : 'other';

    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/waitlist/cloud-managed', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        source,
      }),
    });

    if (!res.ok) {
      return { success: false, error: JOIN_FAILED_MESSAGE };
    }

    const data = (await res.json().catch(() => ({}))) as { rank?: unknown };
    const rank =
      typeof data.rank === 'number' && Number.isFinite(data.rank) ? data.rank : undefined;

    return rank === undefined ? { success: true } : { success: true, rank };
  } catch {
    return { success: false, error: JOIN_FAILED_MESSAGE };
  }
}
