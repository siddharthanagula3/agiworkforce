import { Alert } from 'react-native';
import { router } from 'expo-router';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { clearAuthSession, getAuthHeaders, getAuthToken, refreshAuthSession } from './authSession';
// FIX-MOB-10: every outbound HTTPS call goes through secureFetch — the
// chokepoint that the TLS-pinning gate hooks into. Today it's a
// passthrough; flipping `PINNING_ENFORCED` in lib/pinning.ts (after ops
// drops SPKI hashes) makes it enforce pin coverage at the JS layer.
//
// Zero-leak: every request here targets OUR managed cloud (`${API_URL}/api/...`,
// `${API_URL}/api/upload`). Route through guardedFetch so Local mode refuses the
// call before any network I/O (fail-closed); guardedFetch delegates to
// secureFetch (TLS pinning) when the request is allowed.
import { guardedFetch } from '@/lib/egressGuard';

// ---------------------------------------------------------------------------
// Paywall error type
// ---------------------------------------------------------------------------

/**
 * Thrown by the HTTP client when the API returns HTTP 429 with a structured
 * paywall payload: `{ kind: 'paywall', feature, requiredTier, reason }`.
 *
 * Callers should catch this specifically (not the generic `Error`) to
 * distinguish paywall blocks from other network errors.
 */
export class ApiPaywallError extends Error {
  /** Which feature is gated (e.g. 'token_cap', 'image_quota', 'video_generation'). */
  readonly feature: string;
  /** Minimum tier required to use the feature (e.g. 'hobby', 'pro', 'pro_plus', 'max'). */
  readonly requiredTier: string;
  /** Human-readable description from the server (e.g. '10/10 images used this month'). */
  readonly reason: string;

  constructor(feature: string, requiredTier: string, reason: string) {
    super(`Paywall: ${feature} requires ${requiredTier} tier. ${reason}`);
    this.name = 'ApiPaywallError';
    this.feature = feature;
    this.requiredTier = requiredTier;
    this.reason = reason;
  }
}

/**
 * Authenticated HTTP client.
 * Injects a Clerk/Web API bearer token when the gated Cloud path provides one.
 *
 * Global 401 handling:
 *  - On first 401, attempts a session refresh and retries once.
 *  - If refresh fails, clears the local session facade and alerts
 *    the user to sign in again. The companion pairing session is left intact
 *    (the WebRTC/signaling layer is auth-independent) so pairing survives
 *    a token expiry without breaking the data channel.
 *  - Failed requests are NOT automatically queued here — callers that need
 *    offline retry should use the offlineQueue service.
 */

/** Prevent concurrent token refresh races */
let _refreshing: Promise<boolean> | null = null;
let _refreshFailures = 0;
let _refreshBackoffUntil = 0;
const MAX_REFRESH_FAILURES = 3;
const REFRESH_TIMEOUT_MS = 10_000;

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  if (_refreshFailures >= MAX_REFRESH_FAILURES && Date.now() < _refreshBackoffUntil) {
    return false;
  }

  _refreshing = (async () => {
    try {
      const refreshPromise = refreshAuthSession();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token refresh timed out')), REFRESH_TIMEOUT_MS),
      );
      const refreshed = await Promise.race([refreshPromise, timeoutPromise]);
      if (refreshed) {
        _refreshFailures = 0;
        _refreshBackoffUntil = 0;
        return true;
      }
      _refreshFailures++;
      _refreshBackoffUntil = Date.now() + Math.min(2 ** _refreshFailures * 1000, 60_000);
      return false;
    } catch {
      _refreshFailures++;
      _refreshBackoffUntil = Date.now() + Math.min(2 ** _refreshFailures * 1000, 60_000);
      return false;
    } finally {
      _refreshing = null;
    }
  })();

  return _refreshing;
}

/**
 * Called when all retry attempts are exhausted after a 401.
 * Clears the local cloud session and prompts the user to log in again.
 * The companion pairing WebRTC/signaling session is intentionally preserved —
 * clearing auth tokens does not close the data channel.
 */
function handleUnrecoverableAuth(): void {
  // v1 local-only: no auth UI exists, so prompting the user to "sign in
  // again" would dead-end on a redirect-stub login. Silently clear the
  // session and let the local-mode app shell render; cloud-only callers
  // will surface their own errors when the user opts into cloud.
  if (!FEATURES.auth) {
    clearAuthSession().catch((err) => {
      console.warn('[API] Sign-out cleanup failed (non-blocking):', err);
    });
    return;
  }

  clearAuthSession().catch((err) => {
    console.warn('[API] Sign-out cleanup failed (non-blocking):', err);
  });

  // Make the prompt actionable: the Clerk login screen at /(auth)/login works —
  // it was simply never reached. A bare "OK" stranded the user with no path back
  // into cloud (the P0 dead-end). Offer a Sign In action that routes there.
  Alert.alert('Session Expired', 'Your session has expired. Please sign in again to continue.', [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Sign In',
      style: 'default',
      onPress: () => {
        try {
          router.push('/(auth)/login');
        } catch (err) {
          if (__DEV__) console.warn('[API] login navigation failed (non-blocking):', err);
        }
      },
    },
  ]);
}

interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
  /** Extra request headers (e.g. an `x-csrf-token` for state-changing posts). */
  headers?: Record<string, string>;
  /** Skip the automatic 401 retry (used internally to avoid infinite loops). */
  _skipAuthRetry?: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(await getAuthHeaders()),
  };
  const controller = new AbortController();
  const timeout = options.timeout ?? TIMEOUTS.DEFAULT;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await guardedFetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(options.headers ?? {}),
        ...(init.headers as Record<string, string>),
      },
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

    // Detect structured paywall response before the generic !response.ok branch.
    // The server emits HTTP 429 + { kind: 'paywall', feature, requiredTier, reason }
    // when a user hits 150% of their tier cap. We parse the JSON here so callers
    // can catch ApiPaywallError separately from generic network errors.
    if (response.status === 429) {
      let paywallPayload: Record<string, unknown> | null = null;
      try {
        const bodyText = await response.text();
        // Attempt parse; if it fails fall through to generic error below
        const parsed = JSON.parse(bodyText) as Record<string, unknown>;
        if (parsed && parsed.kind === 'paywall') {
          paywallPayload = parsed;
        } else {
          // Not a paywall 429 — re-throw as generic error with body
          const safeBody =
            bodyText.length > 500 ? bodyText.slice(0, 500) + '...(truncated)' : bodyText;
          throw new Error(`HTTP 429: ${safeBody}`);
        }
      } catch (parseErr) {
        // If parseErr is already an Error we re-threw above, propagate it
        if (parseErr instanceof Error && !parseErr.message.startsWith('{')) {
          throw parseErr;
        }
        throw new Error(`HTTP 429`);
      }

      if (paywallPayload) {
        throw new ApiPaywallError(
          typeof paywallPayload.feature === 'string' ? paywallPayload.feature : 'token_cap',
          typeof paywallPayload.requiredTier === 'string' ? paywallPayload.requiredTier : 'hobby',
          typeof paywallPayload.reason === 'string' ? paywallPayload.reason : '',
        );
      }
    }

    if (!response.ok) {
      const body = await response.text();
      // Structured JSON error bodies carry a human-readable `error` or `message`
      // field — surface that instead of dumping the raw JSON payload verbatim,
      // since callers often show this text directly in chat/error UI.
      let friendlyMessage: string | null = null;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const candidate = parsed.error ?? parsed.message;
        if (typeof candidate === 'string' && candidate.trim()) {
          friendlyMessage = candidate;
        }
      } catch {
        // Not JSON — fall back to the raw (truncated) body below.
      }
      if (friendlyMessage) {
        throw new Error(friendlyMessage);
      }
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
    const token = await getAuthToken();

    const formData = new FormData();
    // React Native FormData accepts { uri, type, name } objects for binary uploads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);

    const controller = new AbortController();
    const timeout = options?.timeout ?? TIMEOUTS.UPLOAD;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await guardedFetch(`${API_URL}/api/upload`, {
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
