type IdentityBrowserClient = {
  loaded?: boolean;
  session: { getToken: () => Promise<string | null> } | null;
} | null;

export const IDENTITY_CLIENT_READY_TIMEOUT_MS = 2_000;
const IDENTITY_CLIENT_POLL_INTERVAL_MS = 25;

let browserClient: IdentityBrowserClient = null;
let readinessPromise: Promise<IdentityBrowserClient> | null = null;

function readBrowserClient(): IdentityBrowserClient {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as Record<string, unknown>)['Clerk'];
  return candidate && typeof candidate === 'object' ? (candidate as IdentityBrowserClient) : null;
}

function waitForBrowserClient(): Promise<IdentityBrowserClient> {
  if (browserClient) return Promise.resolve(browserClient);
  if (readinessPromise) return readinessPromise;

  readinessPromise = (async () => {
    try {
      await import('@clerk/nextjs');
    } catch {
      return null;
    }

    const startedAt = Date.now();
    return new Promise<IdentityBrowserClient>((resolve) => {
      const check = () => {
        const candidate = readBrowserClient();
        if (candidate?.session || candidate?.loaded === true) {
          browserClient = candidate;
          resolve(candidate);
          return;
        }
        if (Date.now() - startedAt >= IDENTITY_CLIENT_READY_TIMEOUT_MS) {
          resolve(null);
          return;
        }
        setTimeout(check, IDENTITY_CLIENT_POLL_INTERVAL_MS);
      };
      check();
    });
  })().finally(() => {
    readinessPromise = null;
  });

  return readinessPromise;
}

export async function getIdentityToken(): Promise<string | null> {
  try {
    const client = await waitForBrowserClient();
    return (await client?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}
