import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { supabase } from './supabase';

/**
 * Authenticated HTTP client.
 * Injects Supabase Bearer token on every request.
 */

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeout = options.timeout ?? TIMEOUTS.DEFAULT;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
      signal: options.signal
        ? combineAbortSignals([options.signal, controller.signal])
        : controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE' }, options),
};
