import { Alert } from 'react-native';
import { router } from 'expo-router';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { clearAuthSession, getAuthHeaders, getAuthToken, refreshAuthSession } from './authSession';
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
import { BILLING_PLAN_CAPABILITY_TIERS, isBillingPlanTier } from '@agiworkforce/types';

import { ApiHttpError, ApiPaywallError, parseJsonBody, rateLimitErrorFrom } from './apiErrors';

export { ApiFreeCapacityError, ApiHttpError, ApiPaywallError } from './apiErrors';
export type { ApiPaywallRecoveryAction } from './apiErrors';

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

function handleUnrecoverableAuth(): void {
  invalidateCloudAccount();
  clearLocalCloudAccountState();

  if (!FEATURES.auth) {
    clearAuthSession().catch((err) => {
      console.warn('[API] Sign-out cleanup failed (non-blocking):', err);
    });
    return;
  }

  clearAuthSession().catch((err) => {
    console.warn('[API] Sign-out cleanup failed (non-blocking):', err);
  });

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
  headers?: Record<string, string>;
  _skipAuthRetry?: boolean;
}

function planUpgradeFeatureForPath(
  path: string,
): 'image_generation' | 'video_generation' | 'paid_capability' {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  if (pathname === '/api/media/video' || pathname.startsWith('/api/media/video/')) {
    return 'video_generation';
  }
  if (pathname === '/api/media/image' || pathname.startsWith('/api/media/image/')) {
    return 'image_generation';
  }
  return 'paid_capability';
}

function minimumTierForPlanUpgradeFeature(
  feature: ReturnType<typeof planUpgradeFeatureForPath>,
): string {
  if (feature === 'image_generation' || feature === 'video_generation') {
    return BILLING_PLAN_CAPABILITY_TIERS[feature][0] ?? 'basic';
  }
  return 'basic';
}

interface SentRequest {
  response: Response;
  release: () => void;
}

async function sendRequest(
  path: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<SentRequest> {
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
  const release = () => clearTimeout(timeoutId);

  const callerSignals = [options.signal, init.signal].filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );

  try {
    const response = await guardedFetch(`${options.baseUrl ?? API_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(options.headers ?? {}),
        ...(init.headers as Record<string, string>),
      },
      signal:
        callerSignals.length > 0
          ? combineAbortSignals([...callerSignals, controller.signal])
          : controller.signal,
    });
    assertApiAccountGeneration(accountGeneration);

    if (response.status === 401 && !options._skipAuthRetry) {
      const refreshed = await tryRefreshToken();
      assertApiAccountGeneration(accountGeneration);
      release();
      if (refreshed) {
        return sendRequest(path, init, { ...options, _skipAuthRetry: true });
      }

      handleUnrecoverableAuth();
      throw new Error('HTTP 401: Session expired. Please sign in again.');
    }

    return { response, release };
  } catch (error) {
    release();
    throw error;
  }
}

const BODYLESS_STATUSES = new Set([204, 205, 304]);

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<Response> {
  const { response, release } = await sendRequest(path, init, options);
  try {
    const body = BODYLESS_STATUSES.has(response.status) ? '' : await response.text();
    return new Response(body.length > 0 ? body : null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    release();
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const accountGeneration = _accountGeneration;
  const { response, release } = await sendRequest(path, init, options);

  try {
    if (response.status === 429) {
      const bodyText = await response.text();
      assertApiAccountGeneration(accountGeneration);
      const parsed = parseJsonBody(bodyText);

      const rateLimitError = rateLimitErrorFrom(parsed);
      if (rateLimitError) throw rateLimitError;

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

      if (response.status === 403) {
        try {
          const parsed = JSON.parse(body) as {
            error?: {
              code?: unknown;
              message?: unknown;
              required_plans?: unknown;
            };
          };
          const code = typeof parsed.error?.code === 'string' ? parsed.error.code : null;
          if (
            code === 'plan_upgrade_required' ||
            code === 'subscription_required' ||
            code === 'subscription_inactive'
          ) {
            const feature = planUpgradeFeatureForPath(path);
            const requiredTier = Array.isArray(parsed.error?.required_plans)
              ? parsed.error.required_plans.find(
                  (candidate): candidate is string =>
                    typeof candidate === 'string' && isBillingPlanTier(candidate),
                )
              : undefined;
            throw new ApiPaywallError(
              feature,
              requiredTier ?? minimumTierForPlanUpgradeFeature(feature),
              typeof parsed.error?.message === 'string' ? parsed.error.message : '',
              code,
            );
          }
        } catch (parseErr) {
          if (parseErr instanceof ApiPaywallError) throw parseErr;
        }
      }

      let friendlyMessage: string | null = null;
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const candidate = parsed.error ?? parsed.message;
        if (typeof candidate === 'string' && candidate.trim()) {
          friendlyMessage = candidate;
        } else if (candidate && typeof candidate === 'object') {
          const nested = candidate as { code?: unknown; message?: unknown };
          if (typeof nested.code === 'string') errorCode = nested.code;
          if (typeof nested.message === 'string' && nested.message.trim()) {
            friendlyMessage = nested.message;
          }
        }
      } catch (err) {
        void err;
      }
      if (friendlyMessage) {
        throw new ApiHttpError(friendlyMessage, response.status, errorCode);
      }
      if (__DEV__) {
        const safeBody = body.length > 500 ? body.slice(0, 500) + '...(truncated)' : body;
        console.warn(`[api] ${init.method ?? 'GET'} ${path} -> HTTP ${response.status}:`, safeBody);
      }
      throw new ApiHttpError(
        response.status >= 500
          ? 'The server hit a problem handling this request. Please try again.'
          : `Request failed (HTTP ${response.status}). Please try again.`,
        response.status,
        errorCode,
      );
    }

    const result = (await response.json()) as T;
    assertApiAccountGeneration(accountGeneration);
    return result;
  } finally {
    release();
  }
}

async function uploadErrorMessage(response: Response, fileName: string): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const candidate = parsed['error'] ?? parsed['message'];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    const nested = (parsed['error'] as { message?: unknown } | undefined)?.message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  } catch (err) {
    void err;
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
  id: string;
  url: string;
  mimeType: string;
  name: string;
  byteCount: number;
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
