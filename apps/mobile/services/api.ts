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

export interface UploadFileInput {
  name: string;
  type: string;
  uri: string;
  base64?: string;
}

export interface UploadFileResult {
  url: string;
  id: string;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE' }, options),

  /**
   * Persist conversation tags to the backend.
   * Used by the auto-tagging service to associate tag labels with a conversation.
   */
  tagConversation: async (id: string, tags: string[], options?: RequestOptions): Promise<void> => {
    await request<void>(
      `/conversations/${id}/tags`,
      { method: 'POST', body: JSON.stringify({ tags }) },
      options,
    );
  },

  /**
   * Upload a file to the server using multipart/form-data.
   * Accepts a React Native file descriptor { uri, name, type }.
   * Returns the remote URL and a server-assigned file ID.
   */
  uploadFile: async (
    file: UploadFileInput,
    options?: RequestOptions,
  ): Promise<UploadFileResult> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const formData = new FormData();
    // React Native FormData accepts { uri, type, name } objects for binary uploads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);

    const controller = new AbortController();
    const timeout = options?.timeout ?? TIMEOUTS.UPLOAD;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // Do NOT set Content-Type — fetch will set it with the correct multipart boundary
        },
        body: formData,
        signal: options?.signal
          ? combineAbortSignals([options.signal, controller.signal])
          : controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Upload failed: HTTP ${response.status}: ${body}`);
      }

      return (await response.json()) as UploadFileResult;
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
