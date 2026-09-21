import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  REQUEST_ID_HEADER,
  newRequestId,
} from '@agiworkforce/cloud-contracts';

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
 * The CSRF token, the build this bundle was served from, the contract it was
 * written against and an id for this one request. The caller adds the surface:
 * this bundle also runs in a shell.
 *
 * The request id is minted per call and echoed by the server on every answer
 * including an error, so a report from a reader names the request that made it.
 *
 * @example
 * const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
 * fetch('/api/checkout', { method: 'POST', headers, body: ... });
 */
export async function addCsrfHeaders(headers: HeadersInit = {}): Promise<HeadersInit> {
  const token = await getCsrfToken();
  const build = process.env['NEXT_PUBLIC_APP_VERSION']?.trim();

  return {
    ...headers,
    'x-csrf-token': token,
    ...(build ? { [CLIENT_VERSION_HEADER]: build } : {}),
    [API_VERSION_REQUEST_HEADER]: API_CONTRACT_VERSION,
    [REQUEST_ID_HEADER]: newRequestId(),
  };
}

export function clearCsrfToken(): void {
  cachedToken = null;
  tokenExpiry = null;
  inFlight = null;
}
