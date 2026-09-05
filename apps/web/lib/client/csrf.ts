interface CsrfTokenResponse {
  token: string;
  expiresIn: number;
}

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
let inFlight: Promise<string> | null = null;

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

export async function getCsrfToken(): Promise<string> {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  if (inFlight) return inFlight;

  inFlight = fetchCsrfToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
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

export function clearCsrfToken(): void {
  cachedToken = null;
  tokenExpiry = null;
  inFlight = null;
}
