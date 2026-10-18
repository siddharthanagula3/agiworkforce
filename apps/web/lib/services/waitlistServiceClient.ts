import {
  PUBLIC_WAITLIST_PATH,
  PublicWaitlistJoinResponseSchema,
  PublicWaitlistTokenResponseSchema,
} from '@agiworkforce/cloud-contracts/waitlist';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { isWaitlistSource, type ConsentDecision } from '@/lib/consent-purposes';

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
}

const JOIN_FAILED_MESSAGE = 'Failed to join waitlist. Please try again.';
const PUBLIC_WAITLIST_TOKEN_DEADLINE_MS = 10_000;
const PUBLIC_WAITLIST_JOIN_DEADLINE_MS = 15_000;

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
      signal: AbortSignal.timeout(PUBLIC_WAITLIST_JOIN_DEADLINE_MS),
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
