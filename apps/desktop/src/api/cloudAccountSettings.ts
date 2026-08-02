/**
 * Cloud Account Settings API Client
 *
 * Bearer-authenticated clients for the account-owned settings surfaces Desktop
 * previously could only reach by opening agiworkforce.com in a child webview.
 * That webview is gated on a Clerk BROWSER COOKIE (`apps/web/proxy.ts`
 * `hasBrowserSessionCookie` + the `/settings(.*)` redirect), which Desktop never
 * propagates — Desktop holds a first-party HS256 device bearer instead
 * (`apps/desktop/src/services/cloudAccountAuth.ts`). So those sections could
 * silently land on `/login` while the app showed the user as signed in.
 *
 * Everything here goes through routes that authenticate with
 * `getClerkAuthUser()` (`apps/web/lib/api-auth.ts`), whose Path 2b accepts the
 * device bearer, and whose CSRF gate is bypassed for a verifying bearer
 * (`apps/web/lib/csrf.ts` `isBearerTokenValid`). Auth/CSRF plumbing is reused
 * from `./cloudApi` so that module stays the single source of truth, exactly as
 * `./cloudConnectors` does.
 *
 * NOT reachable with a bearer, and deliberately absent from this module:
 *   `GET`/`DELETE /api/settings/sessions` — `apps/web/app/api/settings/sessions/route.ts`
 *   authenticates through `requireBrowserSession()`, which calls Clerk's
 *   `auth()` and additionally requires a `sessionId`. A device bearer resolves
 *   neither, so the active-session list and "log out of all devices" cannot be
 *   served to Desktop without a server change. The UI states that outright
 *   rather than faking a list.
 */

import { cloudFetch, getAuthHeaders, CLOUD_API_BASE_URL } from './cloudApi';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../services/managedCloudBoundary';

// ============================================================================
// Shared helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readApiError(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  const error = body['error'];
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  if (typeof body['message'] === 'string') return body['message'];
  return fallback;
}

async function failure(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  return new Error(readApiError(body, `${fallback} (HTTP ${response.status})`));
}

// ============================================================================
// Shared links — GET /api/share, DELETE /api/share/{token}
// ============================================================================

/** Mirrors the row shape returned by `handleListShares` in apps/web/app/api/share/route.ts. */
export interface CloudSharedLink {
  token: string;
  title: string;
  shareUrl: string;
  messageCount: number;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

function parseSharedLink(value: unknown): CloudSharedLink | null {
  if (!isRecord(value)) return null;
  const token = value['token'];
  const shareUrl = value['shareUrl'];
  const createdAt = value['createdAt'];
  const expiresAt = value['expiresAt'];
  if (
    typeof token !== 'string' ||
    !token ||
    typeof shareUrl !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    return null;
  }
  const messageCount = value['messageCount'];
  return {
    token,
    title: typeof value['title'] === 'string' ? value['title'] : 'Shared conversation',
    shareUrl,
    messageCount:
      typeof messageCount === 'number' && Number.isFinite(messageCount) ? messageCount : 0,
    createdAt,
    expiresAt,
    expired: value['expired'] === true,
  };
}

export async function listCloudSharedLinks(): Promise<CloudSharedLink[]> {
  const boundary = captureManagedCloudBoundary('Cloud shared links');
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/share`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw await failure(response, 'Could not load your shared links');
  const payload: unknown = await response.json();
  assertManagedCloudBoundary(boundary);
  const shares = isRecord(payload) ? payload['shares'] : null;
  if (!Array.isArray(shares)) {
    throw new Error('The Cloud share service returned an invalid response.');
  }
  return shares.map(parseSharedLink).filter((share): share is CloudSharedLink => share !== null);
}

export async function revokeCloudSharedLink(token: string): Promise<void> {
  const boundary = captureManagedCloudBoundary('Cloud shared link revocation');
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}/api/share/${encodeURIComponent(token)}`,
    { method: 'DELETE', headers: await getAuthHeaders() },
  );
  if (!response.ok) throw await failure(response, 'Could not revoke this shared link');
  assertManagedCloudBoundary(boundary);
}

// ============================================================================
// Archived Cloud chats — /api/chat/conversations
// ============================================================================

export interface CloudArchivedConversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface CloudArchivedConversationPage {
  conversations: CloudArchivedConversation[];
  hasMore: boolean;
  nextOffset: number;
}

export const CLOUD_ARCHIVED_PAGE_SIZE = 50;

export async function listCloudArchivedConversations(
  offset = 0,
): Promise<CloudArchivedConversationPage> {
  const boundary = captureManagedCloudBoundary('Cloud archived chats');
  const query = new URLSearchParams({
    archived: 'only',
    limit: String(CLOUD_ARCHIVED_PAGE_SIZE),
    offset: String(Math.max(0, offset)),
  });
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}/api/chat/conversations?${query.toString()}`,
    { method: 'GET', headers: await getAuthHeaders() },
  );
  if (!response.ok) throw await failure(response, 'Could not load your archived chats');
  const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
  assertManagedCloudBoundary(boundary);
  return {
    conversations: data.conversations.map((wire) => {
      const conversation = normalizeManagedCloudConversation(wire);
      return {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      };
    }),
    hasMore: data.hasMore,
    nextOffset: data.nextOffset,
  };
}

export async function restoreCloudArchivedConversation(conversationId: string): Promise<void> {
  const boundary = captureManagedCloudBoundary('Cloud archived chat restore');
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}${managedCloudConversationPath(conversationId)}`,
    {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ archived: false }),
    },
  );
  if (!response.ok) throw await failure(response, 'Could not restore this chat');
  ManagedCloudUpdateConversationResponseSchema.parse(await response.json());
  assertManagedCloudBoundary(boundary);
}

export async function deleteCloudConversation(conversationId: string): Promise<void> {
  const boundary = captureManagedCloudBoundary('Cloud conversation deletion');
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}${managedCloudConversationPath(conversationId)}`,
    { method: 'DELETE', headers: await getAuthHeaders() },
  );
  if (!response.ok) throw await failure(response, 'Could not delete this chat');
  ManagedCloudDeleteConversationResponseSchema.parse(await response.json());
  assertManagedCloudBoundary(boundary);
}

// ============================================================================
// Security posture — GET /api/settings/2fa, GET /api/settings/activity
// ============================================================================

export interface CloudTwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getCloudTwoFactorStatus(): Promise<CloudTwoFactorStatus> {
  const boundary = captureManagedCloudBoundary('Cloud two-factor status');
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/settings/2fa`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw await failure(response, 'Could not read two-factor status');
  const payload: unknown = await response.json();
  assertManagedCloudBoundary(boundary);
  if (!isRecord(payload)) {
    throw new Error('The Cloud security service returned an invalid response.');
  }
  const remaining = payload['backup_codes_remaining'];
  return {
    enabled: payload['enabled'] === true,
    backupCodesRemaining:
      typeof remaining === 'number' && Number.isFinite(remaining) ? remaining : 0,
  };
}

export interface CloudSecurityActivity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

export async function listCloudSecurityActivity(limit = 10): Promise<CloudSecurityActivity[]> {
  const boundary = captureManagedCloudBoundary('Cloud security activity');
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, limit))) });
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}/api/settings/activity?${query.toString()}`,
    { method: 'GET', headers: await getAuthHeaders() },
  );
  if (!response.ok) throw await failure(response, 'Could not load recent account activity');
  const payload: unknown = await response.json();
  assertManagedCloudBoundary(boundary);
  const activities = isRecord(payload) ? payload['activities'] : null;
  if (!Array.isArray(activities)) {
    throw new Error('The Cloud activity service returned an invalid response.');
  }
  return activities.flatMap((entry): CloudSecurityActivity[] => {
    if (!isRecord(entry)) return [];
    const id = entry['id'];
    const createdAt = entry['createdAt'];
    if (typeof id !== 'string' || typeof createdAt !== 'string') return [];
    return [
      {
        id,
        type: typeof entry['type'] === 'string' ? entry['type'] : 'activity',
        description:
          typeof entry['description'] === 'string' ? entry['description'] : 'Account activity',
        createdAt,
      },
    ];
  });
}

// ============================================================================
// API keys — /api/settings/api-keys
// ============================================================================

/**
 * Mirrors `API_KEY_SCOPE_VALUES` in `apps/web/lib/api-key-scopes.ts`, which is
 * app-private and cannot be imported here. The server re-validates every scope,
 * so drift surfaces as a 400 with the server's own message rather than a silent
 * mis-issue.
 */
export const CLOUD_API_KEY_SCOPES = [
  { value: 'models:read', label: 'Read model catalog' },
  { value: 'inference:write', label: 'Run inference' },
  { value: 'usage:read', label: 'Read usage' },
] as const;

export type CloudApiKeyScope = (typeof CLOUD_API_KEY_SCOPES)[number]['value'];

export interface CloudApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

function parseApiKey(value: unknown): CloudApiKey | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const name = value['name'];
  const keyPrefix = value['key_prefix'];
  const createdAt = value['created_at'];
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof keyPrefix !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }
  const scopes = value['scopes'];
  const lastUsedAt = value['last_used_at'];
  return {
    id,
    name,
    keyPrefix,
    scopes: Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === 'string') : [],
    createdAt,
    lastUsedAt: typeof lastUsedAt === 'string' ? lastUsedAt : null,
  };
}

export async function listCloudApiKeys(): Promise<CloudApiKey[]> {
  const boundary = captureManagedCloudBoundary('Cloud API keys');
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/settings/api-keys`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw await failure(response, 'Could not load your API keys');
  const payload: unknown = await response.json();
  assertManagedCloudBoundary(boundary);
  const keys = isRecord(payload) ? payload['api_keys'] : null;
  if (!Array.isArray(keys)) {
    throw new Error('The Cloud API key service returned an invalid response.');
  }
  return keys.map(parseApiKey).filter((key): key is CloudApiKey => key !== null);
}

export interface CreatedCloudApiKey {
  apiKey: CloudApiKey;
  /** Returned exactly once by the server; never persisted by Desktop. */
  fullKey: string;
}

export async function createCloudApiKey(
  name: string,
  scopes: readonly CloudApiKeyScope[],
): Promise<CreatedCloudApiKey> {
  const boundary = captureManagedCloudBoundary('Cloud API key creation');
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/settings/api-keys`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ name, scopes }),
  });
  if (!response.ok) throw await failure(response, 'Could not create the API key');
  const payload: unknown = await response.json();
  assertManagedCloudBoundary(boundary);
  const apiKey = isRecord(payload) ? parseApiKey(payload['api_key']) : null;
  const fullKey = isRecord(payload) ? payload['full_key'] : null;
  if (!apiKey || typeof fullKey !== 'string') {
    throw new Error('The Cloud API key service returned an invalid key.');
  }
  return { apiKey, fullKey };
}

export async function revokeCloudApiKey(keyId: string): Promise<void> {
  const boundary = captureManagedCloudBoundary('Cloud API key revocation');
  const response = await cloudFetch(
    `${CLOUD_API_BASE_URL}/api/settings/api-keys/${encodeURIComponent(keyId)}`,
    { method: 'DELETE', headers: await getAuthHeaders() },
  );
  if (!response.ok) throw await failure(response, 'Could not revoke the API key');
  assertManagedCloudBoundary(boundary);
}

// ============================================================================
// Account deletion — DELETE /api/user/delete-account
// ============================================================================

export interface CloudAccountDeletionResult {
  /** Server-provided confirmation copy, if it sent one. */
  message: string | null;
}

/**
 * Schedules erasure of the Cloud account. The server soft-schedules deletion
 * (24h) or, when the profile schema predates that column, erases immediately —
 * Desktop reports whichever message the server returns rather than promising a
 * grace window it cannot verify. Local data is untouched by this call.
 */
export async function requestCloudAccountDeletion(): Promise<CloudAccountDeletionResult> {
  const boundary = captureManagedCloudBoundary('Cloud account deletion');
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}/api/user/delete-account`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw await failure(response, 'Could not delete your Cloud account');
  const payload: unknown = await response.json().catch(() => null);
  assertManagedCloudBoundary(boundary);
  const message = isRecord(payload) ? payload['message'] : null;
  return { message: typeof message === 'string' ? message : null };
}
