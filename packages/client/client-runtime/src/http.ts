/**
 * HTTP transport for cloud-routed commands.
 *
 * Sends commands to the API gateway when running in cloud/web mode.
 * Used by command.ts for cloud-tier and desktop-preferred commands.
 */

import type { CommandCapability } from '@agiworkforce/types';

/** Base URL for the API gateway, configurable via environment variable. */
function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) {
    return process.env['NEXT_PUBLIC_API_URL'];
  }
  if (typeof window !== 'undefined') {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="api-base-url"]');
    if (meta?.content) return meta.content;
  }
  return 'http://localhost:3001/api';
}

/** Resolves the bearer token the API gateway requires. */
export type CloudAuthTokenProvider = () => string | null | Promise<string | null>;

let cloudAuthTokenProvider: CloudAuthTokenProvider | null = null;

/**
 * Register the host application's bearer-token source.
 *
 * This used to read `localStorage['agi-auth-token']`, a key nothing in the
 * repository ever writes, so every cloud-routed command was sent without an
 * `Authorization` header and rejected by the gateway's `authenticateToken`
 * middleware. There is no ambient token to read: the web surface holds a Clerk
 * session and mints tokens through an async `getToken()`, and the desktop
 * surface uses its own exchange. The host must supply one.
 *
 * Pass `null` to unregister (e.g. on sign-out). Known gap: no surface calls
 * this yet, and `index.ts` / `desktop-index.ts` do not re-export it, so every
 * `routeToCloud()` currently fails closed instead of posting anonymously.
 */
export function setCloudAuthTokenProvider(provider: CloudAuthTokenProvider | null): void {
  cloudAuthTokenProvider = provider;
}

/** Get the auth token for API requests. */
async function getAuthToken(): Promise<string | null> {
  if (!cloudAuthTokenProvider) return null;
  return cloudAuthTokenProvider();
}

/**
 * Route a command to the cloud API gateway via HTTP POST.
 * Returns the typed response or throws on failure.
 */
export async function routeToCloud<T>(
  commandName: string,
  args: Record<string, unknown> | undefined,
  _capability: CommandCapability,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = await getAuthToken();

  // Fail before the request rather than shipping the command payload to the
  // gateway with no credential: it would be rejected anyway, and an opaque 401
  // hides the fact that the surface never registered a token provider.
  if (!token) {
    throw new Error(
      `Cloud command "${commandName}" cannot be sent: no auth token is available. ` +
        'Call setCloudAuthTokenProvider() during surface startup.',
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AGI-Runtime': 'web',
    'X-AGI-Command': commandName,
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(`${baseUrl}/command`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command: commandName, args: args ?? {} }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Cloud command "${commandName}" failed (${response.status}): ${errorBody}`);
  }

  const result = (await response.json()) as { data: T };
  return result.data;
}
