type IdentityBrowserClient = {
  session: { getToken: () => Promise<string | null> } | null;
} | null;

let browserClient: IdentityBrowserClient = null;

/**
 * Reads the current session token outside React, for the service modules that
 * call the API without a component around them. The browser global is the
 * provider's own handle, which is why this is the one place that names it.
 */
export async function getIdentityToken(): Promise<string | null> {
  try {
    if (!browserClient) {
      await import('@clerk/nextjs');
      if (
        typeof window !== 'undefined' &&
        (window as unknown as Record<string, unknown>)['Clerk']
      ) {
        browserClient = (window as unknown as Record<string, unknown>)[
          'Clerk'
        ] as IdentityBrowserClient;
      }
    }
    return (await browserClient?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}
