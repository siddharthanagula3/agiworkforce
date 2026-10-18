import { apiErrorMessage } from './api-error';

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(apiErrorMessage(body, `HTTP ${response.status}`)), {
      status: response.status,
    });
  }
  return body as T;
}
