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

/** Get the auth token for API requests. */
async function getAuthToken(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('agi-auth-token');
  }
  return null;
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AGI-Runtime': 'web',
    'X-AGI-Command': commandName,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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
