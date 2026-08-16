
import type { CommandCapability } from '@agiworkforce/types';

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

export type CloudAuthTokenProvider = () => string | null | Promise<string | null>;

let cloudAuthTokenProvider: CloudAuthTokenProvider | null = null;

export function setCloudAuthTokenProvider(provider: CloudAuthTokenProvider | null): void {
  cloudAuthTokenProvider = provider;
}

async function getAuthToken(): Promise<string | null> {
  if (!cloudAuthTokenProvider) return null;
  return cloudAuthTokenProvider();
}

export async function routeToCloud<T>(
  commandName: string,
  args: Record<string, unknown> | undefined,
  _capability: CommandCapability,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = await getAuthToken();

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
