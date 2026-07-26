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
// Zero-leak: every request here targets OUR managed cloud (`${API_URL}/api/...`).
// Route through guardedFetch so Local mode refuses the call before any network
// I/O (fail-closed); guardedFetch delegates to secureFetch (TLS pinning) when
// the request is allowed. The one exception is the presigned chat-attachment
// PUT in uploadFile(), which targets the storage provider rather than our cloud
// and is only reachable after the guarded presign call has already succeeded.
import { guardedFetch } from '@/lib/egressGuard';
import { invalidateCloudAccount } from '@/src/features/auth/services/cloudAccountSession';
import { clearLocalCloudAccountState } from '@/src/features/auth/services/cloudAccountTeardown';
import {
  createUploadTask,
  getInfoAsync,
  FileSystemUploadType,
  type UploadTask,
} from 'expo-file-system/legacy';
import {
  MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
  MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  ManagedCloudChatAttachmentCompleteResponseSchema,
  ManagedCloudChatAttachmentPresignResponseSchema,
  resolveChatAttachmentMimeType,
} from '@agiworkforce/cloud-contracts';

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
  /** Minimum tier required to use the feature (e.g. 'basic', 'pro', 'max_15x'). */
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
let _accountGeneration = 0;
const _activeAccountUploads = new Set<UploadTask>();
const MAX_REFRESH_FAILURES = 3;
const REFRESH_TIMEOUT_MS = 10_000;

class StaleApiAccountOperationError extends Error {
  constructor() {
    super('Cloud account changed while this API request was in flight');
    this.name = 'StaleApiAccountOperationError';
  }
}

function assertApiAccountGeneration(generation: number): void {
  if (generation !== _accountGeneration) {
    throw new StaleApiAccountOperationError();
  }
}

/**
 * Invalidate request/refresh work that captured credentials for the previous
 * Clerk user. Account teardown calls this synchronously before the next
 * account can issue requests.
 */
export function resetApiAccountState(): void {
  _accountGeneration += 1;
  for (const upload of _activeAccountUploads) {
    void upload.cancelAsync().catch((error) => {
      if (__DEV__) console.warn('[api] Failed to cancel stale account upload:', error);
    });
  }
  _activeAccountUploads.clear();
  _refreshing = null;
  _refreshFailures = 0;
  _refreshBackoffUntil = 0;
}

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  if (_refreshFailures >= MAX_REFRESH_FAILURES && Date.now() < _refreshBackoffUntil) {
    return false;
  }

  const generation = _accountGeneration;
  const operation = (async () => {
    try {
      const refreshPromise = refreshAuthSession();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token refresh timed out')), REFRESH_TIMEOUT_MS),
      );
      const refreshed = await Promise.race([refreshPromise, timeoutPromise]);
      if (generation !== _accountGeneration) return false;
      if (refreshed) {
        _refreshFailures = 0;
        _refreshBackoffUntil = 0;
        return true;
      }
      _refreshFailures++;
      _refreshBackoffUntil = Date.now() + Math.min(2 ** _refreshFailures * 1000, 60_000);
      return false;
    } catch {
      if (generation !== _accountGeneration) return false;
      _refreshFailures++;
      _refreshBackoffUntil = Date.now() + Math.min(2 ** _refreshFailures * 1000, 60_000);
      return false;
    } finally {
      if (generation === _accountGeneration) {
        _refreshing = null;
      }
    }
  })();

  _refreshing = operation;
  return operation;
}

/**
 * Called when all retry attempts are exhausted after a 401.
 * Clears the local cloud session and prompts the user to log in again.
 * The companion pairing WebRTC/signaling session is intentionally preserved —
 * clearing auth tokens does not close the data channel.
 */
function handleUnrecoverableAuth(): void {
  // Fail closed immediately. Waiting for Clerk's async signed-out emission
  // leaves the rejected account's cached conversations, entitlements, and
  // in-flight callbacks visible long enough to leak into a subsequent login.
  invalidateCloudAccount();
  clearLocalCloudAccountState();

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
  /**
   * Override the base URL for this request. Use {@link GATEWAY_URL} for routes
   * that exist only on the Express api-gateway (STB-8); omit for the Next.js
   * app, which is the default.
   */
  baseUrl?: string;
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
  const accountGeneration = _accountGeneration;
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(await getAuthHeaders()),
  };
  assertApiAccountGeneration(accountGeneration);
  const controller = new AbortController();
  const timeout = options.timeout ?? TIMEOUTS.DEFAULT;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await guardedFetch(`${options.baseUrl ?? API_URL}${path}`, {
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
    assertApiAccountGeneration(accountGeneration);

    if (response.status === 401 && !options._skipAuthRetry) {
      // Attempt token refresh once, then retry the request
      const refreshed = await tryRefreshToken();
      assertApiAccountGeneration(accountGeneration);
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
      const bodyText = await response.text();
      assertApiAccountGeneration(accountGeneration);
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        // Non-JSON body (HTML error page, proxy output) — never show it raw.
      }

      if (parsed && parsed.kind === 'paywall') {
        throw new ApiPaywallError(
          typeof parsed.feature === 'string' ? parsed.feature : 'token_cap',
          typeof parsed.requiredTier === 'string' ? parsed.requiredTier : 'basic',
          typeof parsed.reason === 'string' ? parsed.reason : '',
        );
      }

      // Not a paywall 429 — surface a friendly rate-limit message.
      const candidate = parsed?.error ?? parsed?.message;
      throw new Error(
        typeof candidate === 'string' && candidate.trim()
          ? candidate
          : 'Too many requests right now. Please wait a moment and try again.',
      );
    }

    if (!response.ok) {
      const body = await response.text();
      assertApiAccountGeneration(accountGeneration);

      // Some routes (e.g. image generation) gate on plan tier with a 403 and
      // an object-shaped `{ error: { code: 'plan_upgrade_required', ... } }`
      // body instead of the 429 `{ kind: 'paywall' }` shape above. Recognise
      // this shape too so the caller's ApiPaywallError handling (upgrade
      // sheet) fires instead of a silent generic-error failure.
      if (response.status === 403) {
        try {
          const parsed = JSON.parse(body) as {
            error?: { code?: string; message?: string; required_plans?: string[] };
          };
          if (parsed.error?.code === 'plan_upgrade_required') {
            throw new ApiPaywallError(
              'image_generation',
              parsed.error.required_plans?.[0] ?? 'pro',
              parsed.error.message ?? '',
            );
          }
        } catch (parseErr) {
          if (parseErr instanceof ApiPaywallError) throw parseErr;
          // Not JSON, or not the plan-upgrade shape — fall through to the
          // generic error handling below.
        }
      }

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
      // Non-JSON bodies (HTML error pages, proxy output) must never reach the
      // UI verbatim. Log the raw body for diagnostics and surface a generic,
      // user-readable message instead.
      if (__DEV__) {
        const safeBody = body.length > 500 ? body.slice(0, 500) + '...(truncated)' : body;
        console.warn(`[api] ${init.method ?? 'GET'} ${path} -> HTTP ${response.status}:`, safeBody);
      }
      throw new Error(
        response.status >= 500
          ? 'The server hit a problem handling this request. Please try again.'
          : `Request failed (HTTP ${response.status}). Please try again.`,
      );
    }

    const result = (await response.json()) as T;
    assertApiAccountGeneration(accountGeneration);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Turn a failed upload-step response into a message that is safe to show the
 * user. Structured `{ error }` bodies carry a human-readable string; anything
 * else (HTML error page, proxy output) must never be rendered verbatim.
 */
async function uploadErrorMessage(response: Response, fileName: string): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const candidate = parsed['error'] ?? parsed['message'];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    const nested = (parsed['error'] as { message?: unknown } | undefined)?.message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  } catch {
    // Not JSON — fall through to the generic message below.
  }
  if (__DEV__ && body) {
    console.warn(`[api] upload step -> HTTP ${response.status}:`, body.slice(0, 500));
  }
  return response.status >= 500
    ? `Uploading "${fileName}" failed because the server hit a problem. Please try again.`
    : `Uploading "${fileName}" failed (HTTP ${response.status}). Please try again.`;
}

export interface UploadFileInput {
  name: string;
  type: string;
  uri: string;
  base64?: string;
}

export interface UploadFileResult {
  /** Owner-scoped media asset id. This is what the chat wire format references. */
  id: string;
  /** Same-origin authenticated serve path for the stored bytes. */
  url: string;
  /** Server-confirmed MIME type. */
  mimeType: string;
  /** Server-confirmed file name. */
  name: string;
  /** Server-confirmed byte count. */
  byteCount: number;
  /** Whether the asset is renderable as an image or handled as a document. */
  type: 'image' | 'file';
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE' }, options),

  /**
   * Upload a chat attachment using the managed-cloud two-step flow.
   *
   * STB-4 fix: this previously POSTed multipart/form-data to `/api/upload`, a
   * route that has never existed in `apps/web/app/api` or the api-gateway. Every
   * mobile file/image attach 404'd, was retried three times by the caller, and
   * then failed with a generic alert. The real surface is the same one Web uses:
   *
   *   1. POST /api/uploads/presign            -> short-lived direct-to-R2 PUT URL
   *   2. PUT  <uploadUrl>                     -> raw bytes, no credentials of ours
   *   3. POST /api/uploads/chat-attachment/complete
   *                                           -> verifies bytes, registers the
   *                                              owner-scoped media asset
   *
   * Steps 1 and 3 go through `guardedFetch`, so Local mode refuses the upload
   * before any byte leaves the device. Step 2 targets the storage provider (not
   * our cloud) and is only reachable once step 1 has already passed that gate.
   *
   * Hardened behaviour:
   *  - 401 on presign: attempts token refresh + one retry (same logic as request())
   *  - Timeout: aborts and throws a clear "timed out" message
   *  - Network interruption mid-upload: throws with message; caller retries
   */
  uploadFile: async (
    file: UploadFileInput,
    options?: RequestOptions,
  ): Promise<UploadFileResult> => {
    const accountGeneration = _accountGeneration;
    const mimeType = resolveChatAttachmentMimeType(file.name, file.type);
    if (!mimeType) {
      throw new Error(
        `"${file.name}" is not a supported attachment. Chat supports images, PDFs, and text/code files.`,
      );
    }

    const info = await getInfoAsync(file.uri);
    assertApiAccountGeneration(accountGeneration);
    if (!info.exists || info.isDirectory) {
      throw new Error(`"${file.name}" could not be read from this device.`);
    }
    const byteCount = info.size;
    if (byteCount <= 0) {
      throw new Error(`"${file.name}" is empty and cannot be attached.`);
    }
    if (byteCount > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" is larger than the 12 MiB chat attachment limit.`);
    }

    const token = await getAuthToken();
    assertApiAccountGeneration(accountGeneration);
    const controller = new AbortController();
    const timeout = options?.timeout ?? TIMEOUTS.UPLOAD;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const signal = options?.signal
      ? combineAbortSignals([options.signal, controller.signal])
      : controller.signal;
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      // ---- Step 1: presign ------------------------------------------------
      const presignResponse = await guardedFetch(
        `${API_URL}${MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...authHeaders,
          },
          body: JSON.stringify({
            kind: 'chat-attachment',
            fileName: file.name,
            mimeType,
            byteCount,
          }),
          signal,
        },
      );
      assertApiAccountGeneration(accountGeneration);

      if (presignResponse.status === 401 && !options?._skipAuthRetry) {
        const refreshed = await tryRefreshToken();
        assertApiAccountGeneration(accountGeneration);
        if (refreshed) {
          return api.uploadFile(file, { ...options, _skipAuthRetry: true });
        }
        handleUnrecoverableAuth();
        throw new Error('Upload failed: session expired. Please sign in again.');
      }
      if (!presignResponse.ok) {
        throw new Error(await uploadErrorMessage(presignResponse, file.name));
      }

      const presign = ManagedCloudChatAttachmentPresignResponseSchema.parse(
        await presignResponse.json(),
      );
      assertApiAccountGeneration(accountGeneration);
      const uploadUrl = new URL(presign.uploadUrl);
      if (
        uploadUrl.protocol !== 'https:' ||
        uploadUrl.username !== '' ||
        uploadUrl.password !== ''
      ) {
        throw new Error(`Refusing an insecure upload destination for "${file.name}".`);
      }

      // ---- Step 2: direct-to-storage PUT ----------------------------------
      // expo-file-system streams the file from disk instead of materialising a
      // 12 MiB base64 string in the JS heap. This host is the storage provider,
      // never our cloud, and is only reachable after step 1 cleared the guard.
      const uploadTask = createUploadTask(uploadUrl.toString(), file.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: presign.uploadHeaders,
      });
      _activeAccountUploads.add(uploadTask);
      const cancelUpload = () => {
        void uploadTask.cancelAsync().catch((error) => {
          if (__DEV__) console.warn('[api] Failed to cancel attachment upload:', error);
        });
      };
      signal.addEventListener('abort', cancelUpload, { once: true });
      let putResult;
      try {
        putResult = await uploadTask.uploadAsync();
      } finally {
        signal.removeEventListener('abort', cancelUpload);
        _activeAccountUploads.delete(uploadTask);
      }
      assertApiAccountGeneration(accountGeneration);
      if (!putResult) {
        if (signal.aborted) {
          const abortError = new Error('Attachment upload aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }
        throw new Error(`Upload of "${file.name}" was cancelled. Please try again.`);
      }
      if (putResult.status < 200 || putResult.status >= 300) {
        throw new Error(
          `Upload of "${file.name}" to storage failed (HTTP ${putResult.status}). Please try again.`,
        );
      }

      // ---- Step 3: complete ------------------------------------------------
      const completeResponse = await guardedFetch(
        `${API_URL}${MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'x-agi-surface': 'mobile',
            ...authHeaders,
          },
          body: JSON.stringify({
            storageKey: presign.storageKey,
            fileName: file.name,
            mimeType,
            byteCount,
          }),
          signal,
        },
      );
      assertApiAccountGeneration(accountGeneration);
      if (!completeResponse.ok) {
        throw new Error(await uploadErrorMessage(completeResponse, file.name));
      }

      const { attachment } = ManagedCloudChatAttachmentCompleteResponseSchema.parse(
        await completeResponse.json(),
      );
      assertApiAccountGeneration(accountGeneration);
      return {
        id: attachment.id,
        url: attachment.url,
        mimeType: attachment.mimeType,
        name: attachment.name,
        byteCount: attachment.byteCount,
        type: attachment.type,
      };
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
