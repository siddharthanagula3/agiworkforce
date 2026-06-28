import { api } from '@/services/api';
import type { InviteCodeError } from '@/src/features/cloud-bridge/types';
import type {
  WaitlistSubmission,
  WaitlistResult,
} from '@/src/features/waitlist/CloudWaitlistSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JoinWaitlistInput {
  email: string;
  country?: string;
  deviceModel?: string;
  deviceTier?: number;
}

export interface JoinWaitlistResult {
  /** Queue position when the backend returns one; null for the anonymous public route. */
  rank: number | null;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class WaitlistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaitlistValidationError';
  }
}

export class WaitlistDuplicateError extends Error {
  constructor() {
    super('This email is already on the waitlist.');
    this.name = 'WaitlistDuplicateError';
  }
}

export class WaitlistNetworkError extends Error {
  constructor(cause?: unknown) {
    super(cause instanceof Error ? cause.message : 'Network error. Please try again.');
    this.name = 'WaitlistNetworkError';
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_ALPHA_INVITE_CODE = 'ALPHATESTER';
const LOCAL_ALPHA_INVITE_ID = 'mobile-alpha-tester';

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new WaitlistValidationError('Please enter a valid email address.');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Submits a Cloud Managed waitlist request through the Web/API layer.
 *
 * Throws:
 *   WaitlistValidationError  — invalid email format (checked locally)
 *   WaitlistNetworkError     — API/network failure
 */
/**
 * Fetch a CSRF token from the Web/API layer. The token is bound to an anonymous
 * session cookie set by this GET; the native HTTP stack persists that cookie and
 * replays it on the subsequent POST, so `requireCsrfToken` validates server-side.
 */
async function fetchCsrfToken(): Promise<string> {
  const { token } = await api.get<{ token?: string }>('/api/csrf');
  if (!token) {
    throw new Error('Failed to acquire CSRF token');
  }
  return token;
}

export async function joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResult> {
  const email = validateEmail(input.email);

  try {
    // Mobile waitlist signups are ANONYMOUS (no Clerk session on this surface),
    // so they must hit /api/waitlist/public — the account-bound
    // /api/waitlist/cloud-managed route calls requireCurrentUserId() and 401s
    // every unauthenticated mobile request (which is why no row was ever
    // written). The public route stores the email with a null user_id.
    // Both routes are CSRF-protected (requireCsrfToken), so the preflight stays.
    const csrfToken = await fetchCsrfToken();

    const response = await api.post<{ ok?: boolean; joined?: boolean; rank?: unknown }>(
      '/api/waitlist/public',
      {
        email,
        // Separate mobile AGI Cloud waitlist source; rolls up into the shared
        // cloud_managed_waitlist table via the source column.
        source: 'mobile',
        country: input.country,
        deviceModel: input.deviceModel,
        deviceTier: input.deviceTier,
      },
      { headers: { 'x-csrf-token': csrfToken } },
    );

    if (response.ok !== true || response.joined !== true) {
      throw new Error('Cloud waitlist signup was not confirmed.');
    }

    // The public route confirms storage but does not return a queue position.
    // Treat rank as optional: surface it when present, otherwise null (the UI
    // shows a generic confirmation rather than a fabricated "#1 in line").
    const rank = Number(response.rank);
    return { rank: Number.isFinite(rank) && rank >= 0 ? Math.floor(rank) : null };
  } catch (err) {
    throw new WaitlistNetworkError(err);
  }
}

/**
 * Legacy: redeem the Mobile Cloud alpha invite code.
 *
 * Managed Cloud is now public alpha (open by default) — signing in is the
 * entitlement, so this invite path is no longer required. It is retained only for
 * backward-compat with existing launch alpha codes; new access comes from sign-in.
 */
export async function redeemInviteCode(
  code: string,
  source: string = 'other',
): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
  void source;
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode === LOCAL_ALPHA_INVITE_CODE) {
    return { success: true, inviteId: LOCAL_ALPHA_INVITE_ID };
  }
  return { success: false, error: 'invalid_code' };
}

/**
 * Submit a CloudWaitlistSheet submission for a specific source surface.
 * Mechanics: posts to `/api/waitlist` with the source tag attached so
 * UI files stay orchestration-only (no direct I/O).
 */
export async function submitWaitlistForSource(
  submission: WaitlistSubmission,
  source: string,
): Promise<WaitlistResult> {
  const csrfToken = await fetchCsrfToken();
  return api.post<WaitlistResult>(
    '/api/waitlist',
    { ...submission, source },
    { headers: { 'x-csrf-token': csrfToken } },
  );
}
