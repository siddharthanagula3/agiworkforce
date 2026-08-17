import { CLOUD_API_BASE_URL } from './cloudApi';
import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_REFLECT_PATH,
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudReflectRecapSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
  type ManagedCloudReflectRange,
  type ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';
import {
  createManagedCloudRequestContext,
  type ManagedCloudRequestContext,
} from '../services/managedCloudRequestContext';

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

async function failure(
  request: ManagedCloudRequestContext,
  response: Response,
  fallback: string,
): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  request.assertBoundary();
  return new Error(readApiError(body, `${fallback} (HTTP ${response.status})`));
}

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
  const request = createManagedCloudRequestContext('Cloud shared links');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/share`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not load your shared links');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const shares = isRecord(payload) ? payload['shares'] : null;
  if (!Array.isArray(shares)) {
    throw new Error('The Cloud share service returned an invalid response.');
  }
  return shares.map(parseSharedLink).filter((share): share is CloudSharedLink => share !== null);
}

export async function revokeCloudSharedLink(token: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud shared link revocation');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/share/${encodeURIComponent(token)}`,
    { method: 'DELETE', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not revoke this shared link');
  request.assertBoundary();
}

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

export const CLOUD_ARCHIVED_PAGE_SIZE = MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;

export async function listCloudArchivedConversations(
  offset = 0,
): Promise<CloudArchivedConversationPage> {
  const request = createManagedCloudRequestContext('Cloud archived chats');
  const query = new URLSearchParams({
    archived: 'only',
    limit: String(CLOUD_ARCHIVED_PAGE_SIZE),
    offset: String(Math.max(0, offset)),
  });
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/chat/conversations?${query.toString()}`,
    { method: 'GET', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not load your archived chats');
  const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
  request.assertBoundary();
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
  const request = createManagedCloudRequestContext('Cloud archived chat restore');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}${managedCloudConversationPath(conversationId)}`,
    {
      method: 'PUT',
      headers: await request.getHeaders(),
      body: JSON.stringify({ archived: false }),
    },
  );
  if (!response.ok) throw await failure(request, response, 'Could not restore this chat');
  ManagedCloudUpdateConversationResponseSchema.parse(await response.json());
  request.assertBoundary();
}

export async function deleteCloudConversation(conversationId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud conversation deletion');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}${managedCloudConversationPath(conversationId)}`,
    { method: 'DELETE', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not delete this chat');
  ManagedCloudDeleteConversationResponseSchema.parse(await response.json());
  request.assertBoundary();
}

export interface CloudTwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getCloudTwoFactorStatus(): Promise<CloudTwoFactorStatus> {
  const request = createManagedCloudRequestContext('Cloud two-factor status');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/2fa`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not read two-factor status');
  const payload: unknown = await response.json();
  request.assertBoundary();
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
  const request = createManagedCloudRequestContext('Cloud security activity');
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, limit))) });
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/activity?${query.toString()}`,
    { method: 'GET', headers: await request.getHeaders() },
  );
  if (!response.ok)
    throw await failure(request, response, 'Could not load recent account activity');
  const payload: unknown = await response.json();
  request.assertBoundary();
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

export interface CloudAccountSession {
  id: string;
  status: string;
  device: string;
  browser: string | null;
  location: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

export interface CloudActiveSessions {
  sessions: CloudAccountSession[];
  currentSessionKnown: boolean;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseAccountSession(value: unknown): CloudAccountSession | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const device = value['device'];
  if (typeof id !== 'string' || !id) return null;
  return {
    id,
    status: typeof value['status'] === 'string' ? value['status'] : 'active',
    device: typeof device === 'string' && device ? device : 'Unknown device',
    browser: optionalString(value['browser']),
    location: optionalString(value['location']),
    createdAt: optionalString(value['createdAt']),
    lastActiveAt: optionalString(value['lastActiveAt']),
    expiresAt: optionalString(value['expiresAt']),
    isCurrent: value['isCurrent'] === true,
  };
}

export async function fetchCloudActiveSessions(): Promise<CloudActiveSessions> {
  const request = createManagedCloudRequestContext('Cloud active sessions');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/sessions`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not load your active sessions');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const rows = isRecord(payload) ? payload['sessions'] : null;
  if (!Array.isArray(rows)) {
    throw new Error('The Cloud session service returned an invalid response.');
  }
  return {
    sessions: rows
      .map(parseAccountSession)
      .filter((row): row is CloudAccountSession => row !== null),
    currentSessionKnown: isRecord(payload) && payload['currentSessionKnown'] === true,
  };
}

export async function revokeCloudSession(sessionId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud session revocation');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not end that session');
  request.assertBoundary();
}

export interface CloudRevokeAllSessionsResult {
  revokedCount: number;
  currentSessionRevoked: boolean;
}

export async function revokeAllCloudSessions(): Promise<CloudRevokeAllSessionsResult> {
  const request = createManagedCloudRequestContext('Cloud session revoke-all');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/sessions`, {
    method: 'DELETE',
    headers: await request.getHeaders(),
  });
  if (!response.ok)
    throw await failure(request, response, 'Could not log out of your other devices');
  const payload: unknown = await response.json().catch(() => null);
  request.assertBoundary();
  const revokedCount = isRecord(payload) ? payload['revokedCount'] : null;
  return {
    revokedCount:
      typeof revokedCount === 'number' && Number.isFinite(revokedCount) ? revokedCount : 0,
    currentSessionRevoked: isRecord(payload) && payload['currentSessionRevoked'] === true,
  };
}

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
  const request = createManagedCloudRequestContext('Cloud API keys');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/api-keys`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not load your API keys');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const keys = isRecord(payload) ? payload['api_keys'] : null;
  if (!Array.isArray(keys)) {
    throw new Error('The Cloud API key service returned an invalid response.');
  }
  return keys.map(parseApiKey).filter((key): key is CloudApiKey => key !== null);
}

export interface CreatedCloudApiKey {
  apiKey: CloudApiKey;
  fullKey: string;
}

export async function createCloudApiKey(
  name: string,
  scopes: readonly CloudApiKeyScope[],
): Promise<CreatedCloudApiKey> {
  const request = createManagedCloudRequestContext('Cloud API key creation');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/api-keys`, {
    method: 'POST',
    headers: await request.getHeaders(),
    body: JSON.stringify({ name, scopes }),
  });
  if (!response.ok) throw await failure(request, response, 'Could not create the API key');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const apiKey = isRecord(payload) ? parseApiKey(payload['api_key']) : null;
  const fullKey = isRecord(payload) ? payload['full_key'] : null;
  if (!apiKey || typeof fullKey !== 'string') {
    throw new Error('The Cloud API key service returned an invalid key.');
  }
  return { apiKey, fullKey };
}

export async function revokeCloudApiKey(keyId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud API key revocation');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/api-keys/${encodeURIComponent(keyId)}`,
    { method: 'DELETE', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not revoke the API key');
  request.assertBoundary();
}

export async function getCloudPreferenceNamespace(
  namespace: string,
): Promise<Record<string, unknown>> {
  const request = createManagedCloudRequestContext(`Cloud ${namespace} preferences`);
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}${managedCloudPreferencesNamespacePath(namespace)}`,
    { method: 'GET', headers: await request.getHeaders() },
  );
  if (!response.ok)
    throw await failure(request, response, `Could not load your ${namespace} settings`);
  const payload: unknown = await response.json();
  request.assertBoundary();
  const settings = isRecord(payload) ? payload['settings'] : null;
  return isRecord(settings) ? settings : {};
}

export async function saveCloudPreferenceNamespace(
  namespace: string,
  value: Record<string, unknown>,
): Promise<void> {
  const request = createManagedCloudRequestContext(`Cloud ${namespace} preference save`);
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}${MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH}`,
    {
      method: 'PUT',
      headers: await request.getHeaders(),
      body: JSON.stringify({ namespace, value }),
    },
  );
  if (!response.ok)
    throw await failure(request, response, `Could not save your ${namespace} settings`);
  request.assertBoundary();
}

export interface CloudAccountProfile {
  email: string | null;
  displayName: string | null;
  preferredName: string | null;
  workDescription: string | null;
}

export async function getCloudAccountProfile(): Promise<CloudAccountProfile> {
  const request = createManagedCloudRequestContext('Cloud account profile');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/me`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not load your Cloud profile');
  const payload: unknown = await response.json();
  request.assertBoundary();
  if (!isRecord(payload)) {
    throw new Error('The Cloud profile service returned an invalid response.');
  }
  const profile = isRecord(payload['profile']) ? payload['profile'] : {};
  const fallbackName = typeof payload['name'] === 'string' ? payload['name'] : null;
  return {
    email: optionalString(payload['email']),
    displayName: optionalString(profile['display_name']) ?? fallbackName,
    preferredName: optionalString(profile['preferred_name']),
    workDescription: optionalString(profile['work_description']),
  };
}

export async function saveCloudDisplayName(displayName: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud display name save');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/me`, {
    method: 'PATCH',
    headers: await request.getHeaders(),
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) throw await failure(request, response, 'Could not save your name');
  request.assertBoundary();
}

export class CloudReflectMemoryRequiredError extends Error {
  constructor() {
    super('Reflect uses the same account chat-history controls as Memory.');
    this.name = 'CloudReflectMemoryRequiredError';
  }
}

export async function fetchCloudReflectRecap(
  range: ManagedCloudReflectRange,
  timezone: string,
): Promise<ManagedCloudReflectRecap> {
  const request = createManagedCloudRequestContext('Cloud reflect recap');
  const query = new URLSearchParams({ range, timezone });
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}${MANAGED_CLOUD_REFLECT_PATH}?${query.toString()}`,
    { method: 'GET', headers: await request.getHeaders() },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    request.assertBoundary();
    const error = isRecord(body) ? body['error'] : null;
    if (response.status === 409 && isRecord(error) && error['code'] === 'memory_required') {
      throw new CloudReflectMemoryRequiredError();
    }
    throw new Error(
      readApiError(body, `Reflect could not load right now (HTTP ${response.status})`),
    );
  }
  const recap = ManagedCloudReflectRecapSchema.parse(await response.json());
  request.assertBoundary();
  return recap;
}

export type CloudTeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export const CLOUD_TEAM_ROLES: readonly CloudTeamRole[] = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const;

function parseTeamRole(value: unknown): CloudTeamRole {
  return CLOUD_TEAM_ROLES.includes(value as CloudTeamRole) ? (value as CloudTeamRole) : 'member';
}

export interface CloudOrganization {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  maxMembers: number | null;
  currentUserRole: CloudTeamRole;
}

export interface CloudWorkspaceMembership {
  id: string;
  name: string;
  slug: string;
  role: CloudTeamRole;
}

export interface CloudOrganizationOverview {
  organization: CloudOrganization | null;
  canManageTeam: boolean;
  activeOrganizationId: string | null;
  workspaces: CloudWorkspaceMembership[];
}

function parseWorkspaceMembership(value: unknown): CloudWorkspaceMembership | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const name = value['name'];
  if (typeof id !== 'string' || !id) return null;
  return {
    id,
    name: typeof name === 'string' && name ? name : 'Workspace',
    slug: typeof value['slug'] === 'string' ? value['slug'] : '',
    role: parseTeamRole(value['role']),
  };
}

function parseOrganization(value: unknown): CloudOrganization | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const name = value['name'];
  if (typeof id !== 'string' || !id || typeof name !== 'string') return null;
  const memberCount = value['memberCount'];
  const maxMembers = value['maxMembers'];
  return {
    id,
    name,
    slug: typeof value['slug'] === 'string' ? value['slug'] : '',
    memberCount: typeof memberCount === 'number' && Number.isFinite(memberCount) ? memberCount : 0,
    maxMembers: typeof maxMembers === 'number' && Number.isFinite(maxMembers) ? maxMembers : null,
    currentUserRole: parseTeamRole(value['currentUserRole']),
  };
}

export async function getCloudOrganizationOverview(): Promise<CloudOrganizationOverview> {
  const request = createManagedCloudRequestContext('Cloud organization overview');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/organization`, {
    method: 'GET',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not load your workspace');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const access = isRecord(payload) && isRecord(payload['access']) ? payload['access'] : {};
  const rawWorkspaces = isRecord(payload) ? payload['workspaces'] : null;
  const activeOrganizationId = isRecord(payload) ? payload['activeOrganizationId'] : null;
  return {
    organization: isRecord(payload) ? parseOrganization(payload['organization']) : null,
    canManageTeam: access['canManageTeam'] === true,
    activeOrganizationId: typeof activeOrganizationId === 'string' ? activeOrganizationId : null,
    workspaces: Array.isArray(rawWorkspaces)
      ? rawWorkspaces
          .map(parseWorkspaceMembership)
          .filter((workspace): workspace is CloudWorkspaceMembership => workspace !== null)
      : [],
  };
}

export async function setActiveCloudWorkspace(organizationId: string | null): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud active workspace');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/organization/active`, {
    method: 'PUT',
    headers: await request.getHeaders(),
    body: JSON.stringify({ organizationId }),
  });
  if (!response.ok) throw await failure(request, response, 'Could not switch workspace');
  request.assertBoundary();
}

export interface CloudTeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: CloudTeamRole;
  isCurrentUser: boolean;
}

function parseTeamMember(value: unknown): CloudTeamMember | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const userId = value['userId'];
  if (typeof id !== 'string' || !id || typeof userId !== 'string') return null;
  return {
    id,
    userId,
    email: typeof value['email'] === 'string' ? value['email'] : '',
    name: typeof value['name'] === 'string' ? value['name'] : userId,
    role: parseTeamRole(value['role']),
    isCurrentUser: value['isCurrentUser'] === true,
  };
}

export async function listCloudTeamMembers(organizationId: string): Promise<CloudTeamMember[]> {
  const request = createManagedCloudRequestContext('Cloud team members');
  const query = new URLSearchParams({ organizationId });
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/team?${query.toString()}`,
    {
      method: 'GET',
      headers: await request.getHeaders(),
    },
  );
  if (!response.ok) throw await failure(request, response, 'Could not load your team');
  const payload: unknown = await response.json();
  request.assertBoundary();
  const members = isRecord(payload) ? payload['members'] : null;
  if (!Array.isArray(members)) {
    throw new Error('The Cloud team service returned an invalid response.');
  }
  return members
    .map(parseTeamMember)
    .filter((member): member is CloudTeamMember => member !== null);
}

export async function addCloudTeamMember(
  organizationId: string,
  email: string,
  role: CloudTeamRole,
): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud team member add');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/settings/team`, {
    method: 'POST',
    headers: await request.getHeaders(),
    body: JSON.stringify({ organizationId, email, role }),
  });
  if (!response.ok)
    throw await failure(request, response, 'Could not add that person to your workspace');
  request.assertBoundary();
}

export async function updateCloudTeamMemberRole(
  memberId: string,
  role: CloudTeamRole,
): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud team role update');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/team/${encodeURIComponent(memberId)}`,
    { method: 'PATCH', headers: await request.getHeaders(), body: JSON.stringify({ role }) },
  );
  if (!response.ok) throw await failure(request, response, 'Could not change that role');
  request.assertBoundary();
}

export async function removeCloudTeamMember(memberId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud team member removal');
  const response = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/settings/team/${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers: await request.getHeaders() },
  );
  if (!response.ok) throw await failure(request, response, 'Could not remove that member');
  request.assertBoundary();
}

export interface CloudAccountDeletionResult {
  message: string | null;
}

export async function requestCloudAccountDeletion(): Promise<CloudAccountDeletionResult> {
  const request = createManagedCloudRequestContext('Cloud account deletion');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/user/delete-account`, {
    method: 'DELETE',
    headers: await request.getHeaders(),
  });
  if (!response.ok) throw await failure(request, response, 'Could not delete your Cloud account');
  const payload: unknown = await response.json().catch(() => null);
  request.assertBoundary();
  const message = isRecord(payload) ? payload['message'] : null;
  return { message: typeof message === 'string' ? message : null };
}
