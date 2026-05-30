/**
 * Client-side CSRF token management
 *
 * Provides utilities for fetching and caching CSRF tokens from the server.
 * Tokens are cached in memory with automatic refresh before expiry.
 */

interface CsrfTokenResponse {
  token: string;
  expiresIn: number; // milliseconds
}

/**
 * Typed error thrown when /api/csrf returns a non-ok HTTP response.
 * Carries the HTTP `status` code so callers can distinguish e.g. 429
 * rate-limit responses from true network failures without breaking
 * callers that only use `instanceof Error` or `.message`.
 */
export class CsrfTokenError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`Failed to fetch CSRF token: ${statusText}`);
    this.name = 'CsrfTokenError';
    this.status = status;
  }
}

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Fetch a fresh CSRF token from the server
 */
async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/csrf', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new CsrfTokenError(response.status, response.statusText);
  }

  const data: CsrfTokenResponse = await response.json();

  // Cache the token with a safety margin (refresh 5 minutes before expiry)
  cachedToken = data.token;
  tokenExpiry = Date.now() + data.expiresIn - 5 * 60 * 1000;

  return data.token;
}

/**
 * Get a valid CSRF token, fetching a new one if needed
 */
export async function getCsrfToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Fetch a new token
  return fetchCsrfToken();
}

/**
 * Add CSRF token to fetch headers
 *
 * @example
 * const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
 * fetch('/api/checkout', { method: 'POST', headers, body: ... });
 */
export async function addCsrfHeaders(headers: HeadersInit = {}): Promise<HeadersInit> {
  const token = await getCsrfToken();

  return {
    ...headers,
    'x-csrf-token': token,
  };
}

/**
 * Clear the cached CSRF token (useful after logout or auth state changes)
 */
export function clearCsrfToken(): void {
  cachedToken = null;
  tokenExpiry = null;
}
