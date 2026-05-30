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
  rank: number;
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
    // /api/waitlist/cloud-managed is CSRF-protected (requireCsrfToken); without
    // this preflight every mobile signup 403'd and no row was ever written.
    const csrfToken = await fetchCsrfToken();

    await api.post<{ ok?: boolean; joined?: boolean }>(
      '/api/waitlist/cloud-managed',
      {
        email,
        // SEPARATE mobile cloud-waitlist list (rolls up into the shared total via
        // the cloud_managed_waitlist `source` column) — mobile local-only funnel.
        source: 'mobile',
        country: input.country,
        deviceModel: input.deviceModel,
        deviceTier: input.deviceTier,
      },
      { headers: { 'x-csrf-token': csrfToken } },
    );
  } catch (err) {
    throw new WaitlistNetworkError(err);
  }

  return { rank: 0 };
}

/**
 * Invite redemption is a Clerk-authenticated Web/API flow. Mobile v1 has no
 * direct cloud auth surface, so this fails closed until the invite account
 * flow is enabled.
 */
export async function redeemInviteCode(
  code: string,
  source: string = 'other',
): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
  void code;
  void source;
  return { success: false, error: 'rpc_error' };
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
