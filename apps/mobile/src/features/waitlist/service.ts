import { api } from '@/services/api';

export interface JoinWaitlistInput {
  email: string;
  country?: string;
  deviceModel?: string;
  deviceTier?: number;
}

export interface JoinWaitlistResult {
  rank: number | null;
}

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new WaitlistValidationError('Please enter a valid email address.');
  }
  return trimmed;
}

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
    const csrfToken = await fetchCsrfToken();

    const response = await api.post<{ ok?: boolean; joined?: boolean; rank?: unknown }>(
      '/api/waitlist/public',
      {
        email,
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

    const rank = Number(response.rank);
    return { rank: Number.isFinite(rank) && rank >= 0 ? Math.floor(rank) : null };
  } catch (err) {
    throw new WaitlistNetworkError(err);
  }
}
