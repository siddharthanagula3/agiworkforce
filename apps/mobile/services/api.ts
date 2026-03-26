import { Alert } from 'react-native';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { supabase } from './supabase';

/**
 * Authenticated HTTP client.
 * Injects Supabase Bearer token on every request.
 *
 * Global 401 handling:
 *  - On first 401, attempts a Supabase session refresh and retries once.
 *  - If refresh fails (expired refresh token), clears the session and alerts
 *    the user to sign in again. The companion pairing session is left intact
 *    (the WebRTC/signaling layer is auth-independent) so pairing survives
 *    a token expiry without breaking the data channel.
 *  - Failed requests are NOT automatically queued here — callers that need
 *    offline retry should use the offlineQueue service.
 */

/** Prevent concurrent token refresh races */
let _refreshing: Promise<boolean> | null = null;

/**
 * Attempt to refresh the Supabase access token.
 * Returns true if the refresh succeeded and we have a new token.
 * Serialises concurrent callers so only one network call is made.
 */
/** Maximum time to wait for a token refresh before giving up (ms). */
const REFRESH_TIMEOUT_MS = 10_000;

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    try {
      const refreshPromise = supabase.auth.refreshSession();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token refresh timed out')), REFRESH_TIMEOUT_MS),
      );
      const { data, error } = await Promise.race([refreshPromise, timeoutPromise]);
      return !error && !!data.session;
    } catch {
      return false;
    } finally {
      _refreshing = null;
    }
  })();

  return _refreshing;
}

/**
 * Called when all retry attempts are exhausted after a 401.
 * Clears the local Supabase session and prompts the user to log in again.
 * The companion pairing WebRTC/signaling session is intentionally preserved —
 * clearing auth tokens does not close the data channel.
 */
function handleUnrecoverableAuth(): void {
  // Clear Supabase session asynchronously — don't block the throw
  supabase.auth.signOut().catch(() => {
    // Ignore network errors during sign-out cleanup
  });

  Alert.alert('Session Expired', 'Your session has expired. Please sign in again to continue.', [
    { text: 'OK', style: 'default' },
  ]);
}

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
  /** Skip the automatic 401 retry (used internally to avoid infinite loops). */
  _skipAuthRetry?: boolean;
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

    if (response.status === 401 && !options._skipAuthRetry) {
      // Attempt token refresh once, then retry the request
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, init, { ...options, _skipAuthRetry: true });
      }

      // Refresh failed — session is truly expired
      handleUnrecoverableAuth();
      throw new Error('HTTP 401: Session expired. Please sign in again.');
    }

    if (!response.ok) {
      const body = await response.text();
      // Avoid leaking sensitive data — truncate long error bodies
      const safeBody = body.length > 500 ? body.slice(0, 500) + '...(truncated)' : body;
      throw new Error(`HTTP ${response.status}: ${safeBody}`);
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
      `/api/conversations/${id}/tags`,
      { method: 'POST', body: JSON.stringify({ tags }) },
      options,
    );
  },

  /**
   * Upload a file to the server using multipart/form-data.
   * Accepts a React Native file descriptor { uri, name, type }.
   * Returns the remote URL and a server-assigned file ID.
   *
   * Hardened behaviour:
   *  - 401: attempts token refresh + one retry (same logic as request())
   *  - Timeout: aborts and throws a clear "timed out" message
   *  - Network interruption mid-upload: throws with message; caller retries
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

      if (response.status === 401 && !options?._skipAuthRetry) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          return api.uploadFile(file, { ...options, _skipAuthRetry: true });
        }
        handleUnrecoverableAuth();
        throw new Error('Upload failed: session expired. Please sign in again.');
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Upload failed: HTTP ${response.status}: ${body}`);
      }

      return (await response.json()) as UploadFileResult;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Upload timed out. Please check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
