import { supabase } from './supabase';

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
// Postgres duplicate-key error code
// ---------------------------------------------------------------------------

const PG_UNIQUE_VIOLATION = '23505';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Inserts a row into `cloud_waitlist` and returns the caller's position in
 * line (0-indexed count of earlier sign-ups, displayed as +1 in the UI).
 *
 * Throws:
 *   WaitlistValidationError  — invalid email format (checked locally)
 *   WaitlistDuplicateError   — email already registered (Postgres 23505)
 *   WaitlistNetworkError     — any other Supabase/network failure
 */
export async function joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResult> {
  const email = validateEmail(input.email);

  const row: Record<string, unknown> = { email };
  if (input.country !== undefined) row.country = input.country;
  if (input.deviceModel !== undefined) row.device_model = input.deviceModel;
  if (input.deviceTier !== undefined) row.device_tier = input.deviceTier;

  const { error: insertError } = await supabase.from('cloud_waitlist').insert(row);

  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      throw new WaitlistDuplicateError();
    }
    throw new WaitlistNetworkError(new Error(insertError.message));
  }

  const { data: rankData, error: rankError } = await supabase.rpc('cloud_waitlist_rank', {
    p_email: email,
  });

  if (rankError) {
    throw new WaitlistNetworkError(new Error(rankError.message));
  }

  const rank = typeof rankData === 'number' ? rankData : 0;
  return { rank };
}
