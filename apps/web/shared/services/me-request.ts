import { hasClerkSessionCookie, hasUsableClerkSessionToken } from '@/lib/clerk-session';

const TOKEN_WAIT_MS = 4000;
const TOKEN_POLL_MS = 100;

let inFlight: Promise<Response> | null = null;

async function waitForUsableToken(): Promise<void> {
  if (!hasClerkSessionCookie() || hasUsableClerkSessionToken()) return;
  const deadline = Date.now() + TOKEN_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
    if (hasUsableClerkSessionToken()) return;
  }
}

export function requestMe(): Promise<Response> {
  if (!inFlight) {
    inFlight = waitForUsableToken()
      .then(() => fetch('/api/me', { credentials: 'include' }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight.then((response) => response.clone());
}
