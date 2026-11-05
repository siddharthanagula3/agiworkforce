import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  REQUEST_ID_HEADER,
  newRequestId,
} from '@agiworkforce/cloud-contracts/client-request';

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
interface CsrfAcquisition {
  promise: Promise<string>;
  retire: () => void;
}

let inFlight: CsrfAcquisition | null = null;

async function fetchCsrfToken(signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/csrf', {
    method: 'GET',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  signal.throwIfAborted();

  if (!response.ok) {
    throw new CsrfTokenError(response.status, response.statusText);
  }

  const data: CsrfTokenResponse = await response.json();
  signal.throwIfAborted();

  // Cache the token with a safety margin (refresh 5 minutes before expiry)
  cachedToken = data.token;
  tokenExpiry = Date.now() + data.expiresIn - 5 * 60 * 1000;

  return data.token;
}

export async function getCsrfToken(): Promise<string> {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  if (inFlight) return inFlight.promise;

  const controller = new AbortController();
  let rejectRetired!: (reason: DOMException) => void;
  const retired = new Promise<never>((_, reject) => {
    rejectRetired = reject;
  });
  const acquisition: CsrfAcquisition = {
    promise: Promise.race([fetchCsrfToken(controller.signal), retired]).finally(() => {
      if (inFlight === acquisition) inFlight = null;
      controller.signal.throwIfAborted();
    }),
    retire: () => {
      const reason = new DOMException('CSRF token acquisition retired', 'AbortError');
      rejectRetired(reason);
      controller.abort(reason);
    },
  };
  inFlight = acquisition;
  return acquisition.promise;
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
export async function addCsrfHeaders(
  headers: HeadersInit = {},
  mintedToken?: string,
): Promise<HeadersInit> {
  const snapshot = new Headers(headers);
  const token = mintedToken ?? (await getCsrfToken());
  const build = process.env['NEXT_PUBLIC_APP_VERSION']?.trim();

  snapshot.set('x-csrf-token', token);
  if (build) snapshot.set(CLIENT_VERSION_HEADER, build);
  snapshot.set(API_VERSION_REQUEST_HEADER, API_CONTRACT_VERSION);
  snapshot.set(REQUEST_ID_HEADER, newRequestId());
  return Object.fromEntries(snapshot.entries());
}

export function clearCsrfToken(): void {
  cachedToken = null;
  tokenExpiry = null;
  const acquisition = inFlight;
  inFlight = null;
  acquisition?.retire();
}
