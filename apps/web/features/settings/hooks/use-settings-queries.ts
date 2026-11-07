/**
 * Settings React Query Hooks
 * Server state management for user settings and profile using React Query
 *
 * @module features/settings/hooks/use-settings-queries
 */

import { translateUiPlural } from '@agiworkforce/ui';
import { useCallback, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { signedOutRedirectUrl, useSignOut } from '@/lib/identity/client';
import { isDesktopHost } from '@/features/desktop-host/lib/host';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import {
  MANAGED_CLOUD_APPROVAL_HISTORY_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { useAuthStore } from '@shared/stores/authentication-store';
import settingsService, { type UserSettings, type APIKey } from '../services/user-preferences';
import { toast } from 'sonner';
import { logger } from '@shared/lib/logger';
import { TimeoutPresets, withTimeout } from '@shared/lib/error-utils';
import {
  BILLING_INTERVALS,
  normalizeTeamSeatType,
  type AdminPolicy,
  type BillingPlanTier,
  type TeamSeatBillingEffect,
  type TeamSeatType,
  type TeamSeatTypeChange,
  type TeamSeatTypeSummary,
} from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders, getCsrfToken } from '@/lib/client/csrf';
import type { CreateApiKeyFormData } from '../schemas/settings-validation';
import { toUserMessage } from '@/lib/user-error-message';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { useStepUp } from './useStepUp';
import { useSelectWorkspace, useWorkspaceSelectionMutation } from '@/features/workspaces/hooks/use-workspaces';
import { useWorkspaceQuery, type WorkspaceQueryScope } from '@/features/workspaces/hooks/use-workspace-query';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  parseAccountDeletionScheduleReceipt,
  type AccountDeletionScheduleReceipt,
} from '@agiworkforce/cloud-contracts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * API key creation result
 */
export interface CreateAPIKeyResult {
  apiKey: APIKey;
  fullKey: string;
}

export interface APIKeyMutationScope {
  readonly request: RequestAuthority;
  readonly organizationId: string | null;
  /** The first write was refused for step-up, so it did not create a key. */
  readonly onStepUpRequired: () => void;
}

export class APIKeyMutationRejectedError extends Error {}

async function sendOwnedAPIKeyRequest(
  scope: APIKeyMutationScope,
  path: string,
  method: 'POST' | 'DELETE',
  body?: string,
  stepUpHeaders: Record<string, string> = {},
): Promise<Response> {
  scope.request.assertCurrent();
  const csrfToken = await getCsrfToken();
  scope.request.assertCurrent();
  return scope.request.fetch(path, {
    method,
    headers: {
      ...stepUpHeaders,
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      [MANAGED_CLOUD_ORGANIZATION_HEADER]:
        scope.organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    },
    ...(body === undefined ? {} : { body }),
  });
}

async function readOwnedAPIKeyReceipt(scope: APIKeyMutationScope, response: Response): Promise<unknown> {
  scope.request.assertCurrent();
  if (!response.ok) {
    const message = await readApiError(response);
    scope.request.assertCurrent();
    if (response.status >= 400 && response.status < 500) throw new APIKeyMutationRejectedError(message);
    throw new Error(message);
  }
  const body: unknown = await response.json();
  scope.request.assertCurrent();
  return body;
}

function apiKeyReceiptRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/**
 * Password change parameters
 */
export interface ChangePasswordParams {
  currentPassword: string | null;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Optimistic update context for settings mutations
 */
interface SettingsMutationContext {
  previousSettings: UserSettings | undefined;
}

/**
 * Fetch user settings
 *
 * @returns UseQueryResult with UserSettings
 */
export function useUserSettings(): UseQueryResult<UserSettings, Error> {
  return useQuery<UserSettings, Error>({
    queryKey: queryKeys.settings.preferences(),
    queryFn: async (): Promise<UserSettings> => {
      const { data, error } = await settingsService.getSettings();
      if (!error) return data;
      // A signed-out visitor is an expected state, not an error, and keeps the
      // defaults; anything else must not pass the defaults off as stored values.
      if (/not authenticated|authentication required|unauthorized|HTTP 401/i.test(String(error))) {
        return data;
      }
      logger.error('[SettingsQuery] Settings error:', error);
      throw new Error(error);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    meta: {
      errorMessage: 'Failed to load user settings',
    },
  });
}

async function readAPIKeys({ request, headers }: WorkspaceQueryScope): Promise<APIKey[]> {
  const timeoutSignal = AbortSignal.timeout(TimeoutPresets.FAST);
  const requestSignal = AbortSignal.any([request.signal, timeoutSignal]);
  try {
    const { data, error } = await withTimeout(
      settingsService.getAPIKeys(requestSignal, { request, headers }),
      TimeoutPresets.FAST,
      'API keys took too long to load.',
    );
    request.assertCurrent();
    requestSignal.throwIfAborted();
    if (error) throw new Error(error);
    return data;
  } catch (error) {
    // Ownership/caller cancellation is not a failed key load, including errors
    // flattened by the service while a token or response body was pending.
    if (!request.isCurrent()) throw error;
    const message = timeoutSignal.aborted
      ? 'API keys took too long to load. Please try again.'
      : error instanceof Error ? error.message : 'Unable to load API keys.';
    logger.error('[SettingsQuery] API keys error:', message);
    throw new Error(message);
  }
}

/** Fetch API keys only for the currently admitted account and workspace. */
export function useAPIKeys() {
  return useWorkspaceQuery(queryKeys.settings.apiKeys(), readAPIKeys, {
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    unavailableMessage: 'API keys are unavailable until your account and workspace are ready.',
    reloadMessage: 'Reload this page to confirm your workspace before loading API keys.',
  });
}

/**
 * Update user settings mutation
 *
 * @returns UseMutationResult for updating user settings
 */
export function useUpdateSettings(): UseMutationResult<
  Partial<UserSettings>,
  Error,
  Partial<UserSettings>,
  SettingsMutationContext
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<Partial<UserSettings>, Error, Partial<UserSettings>, SettingsMutationContext>({
    mutationFn: async (settings: Partial<UserSettings>): Promise<Partial<UserSettings>> => {
      const { error } = await settingsService.updateSettings(settings);
      if (error) {
        throw new Error(error);
      }
      return settings;
    },
    onMutate: async (newSettings: Partial<UserSettings>): Promise<SettingsMutationContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.settings.preferences(),
      });

      const previousSettings = queryClient.getQueryData<UserSettings>(
        queryKeys.settings.preferences(),
      );

      queryClient.setQueryData<UserSettings>(queryKeys.settings.preferences(), (old) =>
        old ? { ...old, ...newSettings } : (newSettings as UserSettings),
      );

      return { previousSettings };
    },
    onSuccess: (): void => {
      toast.success('Settings updated successfully');
    },
    onError: (
      error: Error,
      _variables: Partial<UserSettings>,
      context: SettingsMutationContext | undefined,
    ): void => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.settings.preferences(), context.previousSettings);
      }
      logger.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    },
    onSettled: (): void => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.preferences(),
      });
    },
  });
}

export interface PasswordMutationScope {
  readonly request: RequestAuthority;
  readonly onStepUpRequired: () => void;
}

export interface ChangePasswordReceipt {
  success: true;
  otherSessionsEnded: number;
  otherSessionsRemaining: 0;
  deviceCredentialsRevoked: number;
}

export class PasswordMutationRejectedError extends Error {}

export type ChangePasswordMutation = UseMutationResult<
  ChangePasswordReceipt,
  Error,
  { scope: PasswordMutationScope; draft: ChangePasswordParams }
> & { stepUpDialog: ReactElement | null };

export function useChangePassword(): ChangePasswordMutation {
  const { withStepUp, dialog } = useStepUp();

  const mutation = useMutation<ChangePasswordReceipt, Error,
    { scope: PasswordMutationScope; draft: ChangePasswordParams }>({
    retry: false,
    gcTime: 0,
    mutationFn: async ({ scope, draft }) => {
      scope.request.assertCurrent();
      const { currentPassword, newPassword, confirmPassword } = draft;
      if (newPassword !== confirmPassword) {
        throw new PasswordMutationRejectedError('Passwords do not match');
      }
      const body = JSON.stringify({ newPassword, ...(currentPassword === null ? {} : { currentPassword }) });
      const response = await withStepUp(async (headers) => {
        scope.request.assertCurrent();
        const csrfToken = await getCsrfToken();
        scope.request.assertCurrent();
        return scope.request.fetch('/api/settings/password', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body,
        });
      }, null, { authority: scope.request, onStepUpRequired: scope.onStepUpRequired });
      scope.request.assertCurrent();
      if (!response.ok) {
        const message = await readApiError(response);
        scope.request.assertCurrent();
        if (response.status >= 400 && response.status < 500) throw new PasswordMutationRejectedError(message);
        throw new Error(message);
      }
      const receipt: unknown = await response.json();
      scope.request.assertCurrent();
      const parsed = z.object({
        success: z.literal(true),
        otherSessionsEnded: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        otherSessionsRemaining: z.literal(0),
        deviceCredentialsRevoked: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }).safeParse(receipt);
      if (!parsed.success) throw new Error('The password change receipt could not be confirmed.');
      return parsed.data;
    },
    onError: () => undefined,
  });

  return { ...mutation, stepUpDialog: dialog };
}

export type CreateAPIKeyMutation = UseMutationResult<
  CreateAPIKeyResult,
  Error,
  { scope: APIKeyMutationScope; draft: CreateApiKeyFormData }
> & {
  stepUpDialog: ReactElement | null;
};

export function useCreateAPIKey(): CreateAPIKeyMutation {
  const queryClient: QueryClient = useQueryClient();
  const { withStepUp, dialog } = useStepUp();

  const mutation = useMutation<CreateAPIKeyResult, Error,
    { scope: APIKeyMutationScope; draft: CreateApiKeyFormData }>({
    retry: false,
    gcTime: 0,
    mutationFn: async ({ scope, draft }): Promise<CreateAPIKeyResult> => {
      scope.request.assertCurrent();
      const { name, scopes, expiresInDays, projectId } = draft;
      if (!name.trim()) {
        throw new Error('Please enter a name for the API key');
      }
      const expiresAt =
        !expiresInDays || expiresInDays === 'never'
          ? null
          : new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
      // Freeze both form values and expiry before auth waits or a proof replay.
      const body = JSON.stringify({ name, scopes: [...scopes], expiresAt, projectId: projectId ?? null });
      const response = await withStepUp(
        (headers) => sendOwnedAPIKeyRequest(scope, '/api/settings/api-keys', 'POST', body, headers),
        null,
        { authority: scope.request, onStepUpRequired: scope.onStepUpRequired },
      );
      const created = apiKeyReceiptRecord(await readOwnedAPIKeyReceipt(scope, response));
      scope.request.assertCurrent();
      const key = apiKeyReceiptRecord(created?.api_key);
      if (typeof key?.id !== 'string' || !key.id ||
        typeof created?.full_key !== 'string' || !created.full_key) {
        throw new Error('The API key creation receipt could not be confirmed.');
      }
      return { apiKey: key as unknown as APIKey, fullKey: created.full_key };
    },
    onSuccess: (_receipt, { scope }): void => {
      // Do not delay the once-only key receipt behind a background list reload.
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys() });
      }
    },
    // The intent-owning UI presents errors; the shared MutationCache still logs.
    onError: () => undefined,
  });

  return { ...mutation, stepUpDialog: dialog };
}

/**
 * Delete API key mutation
 *
 * @returns UseMutationResult for deleting API key
 */
export function useDeleteAPIKey(): UseMutationResult<string, Error,
  { scope: APIKeyMutationScope; keyId: string }> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<string, Error, { scope: APIKeyMutationScope; keyId: string }>({
    retry: false,
    mutationFn: async ({ scope, keyId }): Promise<string> => {
      const response = await sendOwnedAPIKeyRequest(scope,
        `/api/settings/api-keys/${encodeURIComponent(keyId)}`, 'DELETE');
      const receipt = apiKeyReceiptRecord(await readOwnedAPIKeyReceipt(scope, response));
      scope.request.assertCurrent();
      if (typeof receipt?.message !== 'string' || !receipt.message) {
        throw new Error('The API key revocation receipt could not be confirmed.');
      }
      return keyId;
    },
    onSuccess: (_keyId, { scope }): void => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys() });
      }
    },
    onError: () => undefined,
  });
}

/** Parsed response from `DELETE /api/user/delete-account`. */
export type DeleteAccountResult = AccountDeletionScheduleReceipt;

const DELETION_SCHEDULE_UNCONFIRMED =
  'We could not confirm whether deletion was scheduled. Reload the page, then check Settings > Account before trying again.';

function readDeleteAccountError(data: unknown, fallback: string, status: number): string {
  let raw = '';
  if (data !== null && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) raw = error;
  }
  return toUserMessage(Object.assign(new Error(raw || `HTTP ${status}`), { status }), fallback);
}

/**
 * Delete-account mutation: the single implementation behind the account
 * deletion flow (AccountSection is the only caller). It owns:
 *   - CSRF headers on the DELETE call
 *   - parsing the server's real `{ message, scheduledFor }` body instead of
 *     rendering a hardcoded "24 hours" string that can drift from server
 *     policy
 *   - the post-success sign-out sequence, so a successful deletion can never
 *     leave a live client session behind against an account scheduled for
 *     erasure
 *
 * Sign-out is exposed as a separate `signOutAfterDeletion` step rather than
 * run automatically on mutation success, because the UI shows a confirmation
 * dialog with a "Continue" button first, the caller decides when to sign out.
 */
const SITE_HOME_PATH = '/';

export function useDeleteAccount(): UseMutationResult<DeleteAccountResult, Error, void> & {
  signOutAfterDeletion: () => Promise<void>;
  stepUpDialog: ReactElement | null;
} {
  const logout = useAuthStore((s) => s.logout);
  const identitySignOut = useSignOut();
  const router = useRouter();
  const { withStepUp, dialog } = useStepUp();

  const mutation = useMutation<DeleteAccountResult, Error, void>({
    retry: false,
    mutationFn: async (): Promise<DeleteAccountResult> => {
      const res = await withStepUp(async (stepUpHeaders) =>
        fetch(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, {
          method: 'DELETE',
          headers: {
            ...(await addCsrfHeaders({ 'Content-Type': 'application/json' })),
            ...stepUpHeaders,
          },
        }),
      ).catch((error: unknown) => {
        if (isStepUpCancelled(error)) throw error;
        throw new Error(DELETION_SCHEDULE_UNCONFIRMED);
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readDeleteAccountError(data, 'Account deletion failed.', res.status));
      }
      try {
        return parseAccountDeletionScheduleReceipt(data);
      } catch {
        throw new Error(DELETION_SCHEDULE_UNCONFIRMED);
      }
    },
    onError: (error: Error): void => {
      if (isStepUpCancelled(error)) return;
      logger.error('Error deleting account:', error);
    },
  });

  const signOutAfterDeletion = useCallback(async (): Promise<void> => {
    // `signedOutRedirectUrl` is what decides where this lands: the marketing
    // home in a browser, the sign-in route inside the desktop shell, which does
    // not host the marketing site and would open it in a browser instead.
    const destination = signedOutRedirectUrl(SITE_HOME_PATH, isDesktopHost());
    try {
      await logout();
      await identitySignOut({ redirectUrl: destination });
    } catch (err) {
      // Account deletion is already scheduled server-side by the time this runs
      // (it only fires after the mutation above succeeded), if
      // logout()/identitySignOut() fail here (e.g. a network blip), fall back
      // to a hard navigation instead of leaving the user stuck on a dead
      // settings screen with no feedback and no way out.
      console.warn('[useDeleteAccount] Post-deletion sign-out failed, forcing navigation:', err);
    } finally {
      router.replace(destination ?? SITE_HOME_PATH);
    }
  }, [logout, identitySignOut, router]);

  return { ...mutation, signOutAfterDeletion, stepUpDialog: dialog };
}

/**
 * Current account-deletion schedule for the signed-in user, as recorded on
 * `profiles.deletion_requested_at` / `profiles.deletion_scheduled_for` and
 * read back from `GET /api/user/delete-account`.
 *
 * `canCancel` is `false` once `scheduledFor` has passed even though `pending`
 * stays `true`, the grace window is closed and the purge cron owns the row
 * from here, so the UI must not offer a cancel control it cannot honour.
 */
export type { AccountDeletionStatus } from '@agiworkforce/cloud-contracts';

/**
 * Reads whether an account deletion is currently scheduled, so the settings
 * UI can show the pending state and a cancel control instead of only ever
 * offering "Delete account".
 */
export { useAccountDeletionStatus } from './use-account-deletion-status';

export { useCancelAccountDeletion, type CancelAccountDeletionResult } from './use-cancel-account-deletion';

// ============================================================================
// ORGANIZATION SETTINGS HOOKS
// ============================================================================

/**
 * Organization settings structure
 */
export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  plan: BillingPlanTier;
  memberCount: number;
  /** Unknown until licensed seat quantity is persisted by billing. */
  maxMembers: number | null;
  createdAt: string;
  updatedAt: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface OrganizationAccess {
  plan: BillingPlanTier;
  canManageTeam: boolean;
  maxMembers: number | null;
  seatsConsumed: number | null;
  seatsAvailable: number | null;
  seatSource: 'billing' | 'unprovisioned' | 'unknown';
}

export interface OrganizationOverview {
  organization: OrganizationSettings | null;
  activeOrganizationId: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrganizationSettings['currentUserRole'];
    joinedAt: string;
  }>;
  access: OrganizationAccess;
}

const OrganizationRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
const OrganizationOverviewSchema = z.object({
  organization: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      plan: z.string(),
      memberCount: z.number().int().nonnegative(),
      maxMembers: z.number().int().nonnegative().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      currentUserRole: OrganizationRoleSchema,
    })
    .nullable(),
  activeOrganizationId: z.string().uuid().nullable(),
  workspaces: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      role: OrganizationRoleSchema,
      joinedAt: z.string(),
    }),
  ),
  access: z.object({
    plan: z.string(),
    canManageTeam: z.boolean(),
    maxMembers: z.number().int().nonnegative().nullable(),
    seatsConsumed: z.number().int().nonnegative().nullable(),
    seatsAvailable: z.number().int().nonnegative().nullable(),
    seatSource: z.enum(['billing', 'unprovisioned', 'unknown']),
  }),
});

interface ApiErrorEnvelope {
  error?: string | { message?: string };
}

const REQUEST_FAILED = 'The request failed. Please try again.';

function statusMessage(status: number): string {
  return toUserMessage(Object.assign(new Error(`HTTP ${status}`), { status }), REQUEST_FAILED);
}

async function readApiError(response: Response): Promise<string> {
  const fallback = statusMessage(response.status);
  const body = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
  if (typeof body?.error === 'string' && body.error.trim()) {
    return toUserMessage(
      Object.assign(new Error(body.error), { status: response.status }),
      fallback,
    );
  }
  if (
    body?.error &&
    typeof body.error === 'object' &&
    typeof body.error.message === 'string' &&
    body.error.message.trim()
  ) {
    return toUserMessage(
      Object.assign(new Error(body.error.message), { status: response.status }),
      fallback,
    );
  }
  return fallback;
}

async function fetchOrganizationOverview(): Promise<OrganizationOverview> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');

  const response = await fetch('/api/settings/organization', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const parsed = OrganizationOverviewSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The workspace response was invalid');
  return parsed.data as OrganizationOverview;
}

export function useOrganizationOverview(): UseQueryResult<OrganizationOverview, Error> {
  return useQuery<OrganizationOverview, Error>({
    queryKey: ['settings', 'organization', 'current'],
    queryFn: fetchOrganizationOverview,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      errorMessage: 'Failed to load organization settings',
    },
  });
}

export function useSwitchWorkspace() {
  return useSelectWorkspace('organization');
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export function useCreateOrganization() {
  return useWorkspaceSelectionMutation<CreateOrganizationInput>((input) => ({
    url: '/api/settings/organization', method: 'POST', body: input,
    errorMessage: 'We could not create your workspace. Try again.',
  }));
}

/**
 * Update organization settings mutation
 *
 * @returns UseMutationResult for updating organization settings
 */
export function useUpdateOrganizationSettings(): UseMutationResult<
  OrganizationSettings,
  Error,
  { organizationId: string; updates: Partial<Pick<OrganizationSettings, 'name' | 'slug'>> }
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<
    OrganizationSettings,
    Error,
    { organizationId: string; updates: Partial<Pick<OrganizationSettings, 'name' | 'slug'>> }
  >({
    retry: false,
    mutationFn: async ({ organizationId, updates }): Promise<OrganizationSettings> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const response = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
          [MANAGED_CLOUD_ORGANIZATION_HEADER]: organizationId,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as { organization?: OrganizationSettings };
      if (!body.organization) throw new Error('Invalid response from server');
      return body.organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Organization settings updated');
    },
    onError: (error: Error) => {
      logger.error('Failed to update organization settings:', error);
      toast.error('Failed to update organization settings');
    },
  });
}

// ============================================================================
// TEAM MEMBERS HOOKS
// ============================================================================

/**
 * Team member structure
 */
export interface TeamMember {
  id: string;
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  seatType: TeamSeatType;
  premiumPaidThrough: string | null;
  status: 'active';
  provisionedAt: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  permissions: string[];
  isCurrentUser: boolean;
}

/**
 * Fetch team members for an organization
 *
 * @param organizationId - The organization ID
 * @returns UseQueryResult with array of TeamMember
 */
export function useTeamMembers(
  organizationId: string | undefined,
): UseQueryResult<TeamMember[], Error> {
  return useQuery<TeamMember[], Error>({
    queryKey: ['settings', 'team', organizationId ?? ''],
    queryFn: async (): Promise<TeamMember[]> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const url = `/api/settings/team?organizationId=${encodeURIComponent(organizationId!)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const json = (await res.json()) as { members: TeamMember[] };
      return (json.members ?? []).map((member) => ({
        ...member,
        seatType: normalizeTeamSeatType(member.seatType),
        premiumPaidThrough: member.premiumPaidThrough ?? null,
      }));
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    meta: {
      errorMessage: 'Failed to load team members',
    },
  });
}

export type TeamSeatTypes = TeamSeatTypeSummary;

const TeamSeatTypesSchema = z.object({
  seatTypes: z
    .object({
      licensedPremiumSeats: z.number().int().nonnegative(),
      premiumSeatsAssigned: z.number().int().nonnegative(),
      billing: z.object({
        interval: z.enum(BILLING_INTERVALS),
        currency: z.string(),
        premiumSeatsSold: z.boolean(),
      }),
    })
    .nullable(),
});

export function useTeamSeatTypes(
  organizationId: string | undefined,
): UseQueryResult<TeamSeatTypes | null, Error> {
  return useQuery<TeamSeatTypes | null, Error>({
    queryKey: ['settings', 'team', organizationId ?? '', 'seat-types'],
    queryFn: async (): Promise<TeamSeatTypes | null> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(
        `/api/settings/team/seat-types?organizationId=${encodeURIComponent(organizationId!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      return TeamSeatTypesSchema.parse(await res.json()).seatTypes;
    },
    enabled: !!organizationId,
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load seat types' },
  });
}

const SEAT_TYPE_CHANGE_MESSAGES: Readonly<Record<TeamSeatBillingEffect, string>> = {
  none: 'Seat type is unchanged',
  uses_paid_seat: 'Premium seat assigned. It was already paid for, so nothing was charged.',
  charged_now: 'Premium seat assigned. The rest of this billing period was charged.',
  restored_paid_seat: 'Premium seat restored. This period was already paid for.',
  reduced_at_renewal: 'Seat moves to Standard. Premium usage stays until this period ends.',
};

export class SeatTypePaymentRequiredError extends Error {
  readonly paymentUrl: string | null;

  constructor(message: string, paymentUrl: string | null) {
    super(message);
    this.name = 'SeatTypePaymentRequiredError';
    this.paymentUrl = paymentUrl;
  }
}

const SEAT_PAYMENT_REQUIRED_MESSAGE =
  'The charge for the Premium seat has not completed, so the member is still on a Standard seat. Pay the invoice, then assign the Premium seat again: the paid seat is used and nothing is charged twice.';

function securePaymentUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function useUpdateTeamMemberSeatType(): UseMutationResult<
  TeamSeatTypeChange,
  Error,
  { memberId: string; organizationId: string; seatType: TeamSeatType }
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<
    TeamSeatTypeChange,
    Error,
    { memberId: string; organizationId: string; seatType: TeamSeatType }
  >({
    mutationFn: async ({ memberId, seatType }): Promise<TeamSeatTypeChange> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const res = await fetch(`/api/settings/team/${encodeURIComponent(memberId)}/seat`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ seatType }),
      });

      if (res.status === 402) {
        const pending = (await res.json().catch(() => ({}))) as { paymentUrl?: unknown };
        throw new SeatTypePaymentRequiredError(
          SEAT_PAYMENT_REQUIRED_MESSAGE,
          securePaymentUrl(pending.paymentUrl),
        );
      }
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      return (await res.json()) as TeamSeatTypeChange;
    },
    onSuccess: (change, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'team', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success(SEAT_TYPE_CHANGE_MESSAGES[change.billing]);
    },
    onError: (error: Error) => {
      logger.error('Failed to change team member seat type:', error);
      if (error instanceof SeatTypePaymentRequiredError) return;
      toast.error(toUserMessage(error, 'The seat type was not changed.'));
    },
  });
}

export type TeamInvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface TeamInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  status: TeamInvitationStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: string;
  resentAt: string | null;
  resendCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSeatState {
  organizationId: string;
  licensedSeats: number;
  seatsConsumed: number;
  seatsAvailable: number;
  seatSource: 'billing' | 'unprovisioned';
  ownerUserId: string | null;
}

export interface TeamInvitationsOverview {
  invitations: TeamInvitation[];
  seats: TeamSeatState | null;
}

export interface TeamInvitationCredentialResult {
  invitation: TeamInvitation;
  inviteToken: string;
  delivery: { emailSent: true } | { emailSent: false; reason: string };
}

const TeamInvitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
  status: z.enum(['pending', 'accepted', 'declined', 'revoked', 'expired']),
  invitedByUserId: z.string(),
  acceptedByUserId: z.string().nullable(),
  expiresAt: z.string(),
  resentAt: z.string().nullable(),
  resendCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const TeamSeatStateSchema = z.object({
  organizationId: z.string(),
  licensedSeats: z.number().int().nonnegative(),
  seatsConsumed: z.number().int().nonnegative(),
  seatsAvailable: z.number().int().nonnegative(),
  seatSource: z.enum(['billing', 'unprovisioned']),
  ownerUserId: z.string().nullable(),
});

const TeamInvitationsOverviewSchema = z.object({
  invitations: z.array(TeamInvitationSchema),
  seats: TeamSeatStateSchema.nullable(),
});

const TeamInvitationCredentialResultSchema = z.object({
  invitation: TeamInvitationSchema,
  inviteToken: z.string().min(20).max(512),
  // A configured email provider sends the invitation, so both answers are real.
  delivery: z.discriminatedUnion('emailSent', [
    z.object({ emailSent: z.literal(true) }),
    z.object({ emailSent: z.literal(false), reason: z.string() }),
  ]),
});

export function useTeamInvitations(
  organizationId: string | undefined,
): UseQueryResult<TeamInvitationsOverview, Error> {
  return useQuery<TeamInvitationsOverview, Error>({
    queryKey: ['settings', 'team', organizationId ?? '', 'invitations'],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const response = await fetch(
        `/api/settings/team/invitations?organizationId=${encodeURIComponent(organizationId!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      return TeamInvitationsOverviewSchema.parse(await response.json());
    },
    enabled: !!organizationId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    meta: { errorMessage: 'Failed to load team invitations' },
  });
}

export function useCreateTeamInvitation(): UseMutationResult<
  TeamInvitationCredentialResult,
  Error,
  { organizationId: string; email: string; role: TeamInvitation['role'] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/settings/team/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      return TeamInvitationCredentialResultSchema.parse(await response.json());
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId, 'invitations'],
      });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Invitation created. Copy the private link to share it.');
    },
    onError: (error: Error) => toast.error(toUserMessage(error, 'Failed to create invitation')),
  });
}

export function useResendTeamInvitation(): UseMutationResult<
  TeamInvitationCredentialResult,
  Error,
  { organizationId: string; invitationId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, invitationId }) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        `/api/settings/team/invitations/${encodeURIComponent(invitationId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ organizationId, action: 'resend' }),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      return TeamInvitationCredentialResultSchema.parse(await response.json());
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId, 'invitations'],
      });
      toast.success('A new private invitation link is ready.');
    },
    onError: (error: Error) => toast.error(toUserMessage(error, 'Failed to renew invitation')),
  });
}

export function useRevokeTeamInvitation(): UseMutationResult<
  void,
  Error,
  { organizationId: string; invitationId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, invitationId }) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        `/api/settings/team/invitations/${encodeURIComponent(invitationId)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-csrf-token': csrfToken,
          },
        },
      );
      if (!response.ok) throw new Error(await readApiError(response));
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId, 'invitations'],
      });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Invitation revoked and its seat released.');
    },
    onError: (error: Error) => toast.error(toUserMessage(error, 'Failed to revoke invitation')),
  });
}

export {
  useLeaveOrganization,
  useTransferOrganizationOwnership,
  type LeaveOrganizationVariables,
  type LeaveOrganizationMutation,
  type OrganizationOwnerRoleAfterTransfer,
  type TransferOwnershipVariables,
  type TransferOwnershipMutation,
  type PreparedWorkspaceMembershipAction,
} from './use-organization-membership-mutation';

export function useRemoveTeamMember(): UseMutationResult<
  void,
  Error,
  { memberId: string; organizationId: string }
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<void, Error, { memberId: string; organizationId: string }>({
    mutationFn: async ({
      memberId,
    }: {
      memberId: string;
      organizationId: string;
    }): Promise<void> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const res = await fetch(`/api/settings/team/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Team member removed');
    },
    onError: (error: Error) => {
      logger.error('Failed to remove team member:', error);
      toast.error('Failed to remove team member');
    },
  });
}

/**
 * Update team member role mutation
 *
 * @returns UseMutationResult for updating team member role
 */
export function useUpdateTeamMemberRole(): UseMutationResult<
  void,
  Error,
  { memberId: string; organizationId: string; role: TeamMember['role'] }
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { memberId: string; organizationId: string; role: TeamMember['role'] }
  >({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      organizationId: string;
      role: TeamMember['role'];
    }): Promise<void> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const res = await fetch(`/api/settings/team/${encodeURIComponent(memberId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ role }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Member role updated');
    },
    onError: (error: Error) => {
      logger.error('Failed to update team member role:', error);
      toast.error('Failed to update role');
    },
  });
}

// ============================================================================
// USER ACTIVITY HOOKS
// ============================================================================

/**
 * User activity record
 */
export interface UserActivity {
  id: string;
  /** What happened, in a sentence the server's route-to-event map produced. */
  sentence: string;
  /** What it was done from, in the sessions list's shape. Never an address. */
  device: string | null;
  createdAt: string;
}

export function useUserActivity(limit: number = 50): UseQueryResult<UserActivity[], Error> {
  return useQuery<UserActivity[], Error>({
    queryKey: ['settings', 'activity', limit],
    queryFn: async (): Promise<UserActivity[]> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/settings/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(statusMessage(res.status));
      }

      const json = (await res.json()) as { activities: UserActivity[] };
      return json.activities ?? [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    meta: {
      errorMessage: 'Failed to load user activity',
    },
  });
}

export interface ApprovalHistoryEntry {
  id: string;
  toolName: string;
  decision: 'approved' | 'rejected';
  conversationId: string | null;
  createdAt: string;
}

export interface ApprovalHistoryPage {
  approvals: ApprovalHistoryEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function useApprovalHistory(
  limit: number,
  cursor: string | null,
): UseQueryResult<ApprovalHistoryPage, Error> {
  return useQuery<ApprovalHistoryPage, Error>({
    queryKey: ['settings', 'approvals', limit, cursor],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`${MANAGED_CLOUD_APPROVAL_HISTORY_PATH}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(statusMessage(res.status));
      const json = (await res.json()) as Partial<ApprovalHistoryPage>;
      return {
        approvals: json.approvals ?? [],
        hasMore: json.hasMore === true,
        nextCursor: json.nextCursor ?? null,
      };
    },
    staleTime: 60 * 1000,
    meta: {
      errorMessage: 'Failed to load approval history',
    },
  });
}

// ============================================================================
// AUDIT LOGS HOOKS
// ============================================================================

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  action: string;
  sentence: string;
  device: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  hasMore: boolean;
}

/**
 * Audit log filter options
 */
export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Fetch audit logs
 *
 * @param filters - Filter options for audit logs
 * @returns UseQueryResult with array of AuditLogEntry
 */
export function useAuditLogs(filters?: AuditLogFilters): UseQueryResult<AuditLogPage, Error> {
  const {
    userId,
    action,
    resourceType,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters || {};

  return useQuery<AuditLogPage, Error>({
    queryKey: [
      'audit',
      'logs',
      {
        userId,
        action,
        resourceType,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        limit,
        offset,
      },
    ],
    queryFn: async (): Promise<AuditLogPage> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const params = new URLSearchParams();
      if (action) params.set('action', action);
      if (resourceType) params.set('resourceType', resourceType);
      if (startDate) params.set('startDate', startDate.toISOString());
      if (endDate) params.set('endDate', endDate.toISOString());
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/settings/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(statusMessage(res.status));
      }

      const json = (await res.json()) as Partial<AuditLogPage>;
      return {
        entries: Array.isArray(json.entries) ? json.entries : [],
        hasMore: json.hasMore === true,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    meta: {
      errorMessage: 'Failed to load audit logs',
    },
  });
}

/**
 * Get audit log actions (for filter dropdown)
 *
 * @returns UseQueryResult with array of action strings
 */
export function useAuditLogActions(): UseQueryResult<string[], Error> {
  return useQuery<string[], Error>({
    queryKey: ['audit', 'actions'],
    queryFn: async (): Promise<string[]> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch('/api/settings/audit-logs/actions', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(statusMessage(res.status));
      }

      const json = (await res.json()) as { actions: string[] };
      return json.actions ?? [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    meta: {
      errorMessage: 'Failed to load audit log actions',
    },
  });
}

// ============================================================================
// ORGANIZATION SHARED ECOSYSTEM (migration 0086)
// ============================================================================

export type OrgSharingRole = 'owner' | 'admin' | 'member' | 'viewer';
export type OrgMemberProjectAccess = 'read' | 'write' | 'none';

export interface OrgSharedProject {
  projectId: string;
  organizationId: string;
  name: string;
  ownerUserId: string;
  sharedByUserId: string;
  defaultAccess: 'read' | 'write' | 'none';
  createdAt: string;
  /** Explicit per-member overrides. Members not listed inherit `defaultAccess`. */
  memberGrants: { userId: string; access: OrgMemberProjectAccess }[];
}

export interface OrgSharedConnector {
  organizationId: string;
  connectorRowId: string;
  /** Chat-facing id: shared connector tools appear as `orgmcp-<orgShortId>`. */
  orgShortId: string;
  name: string;
  url: string;
  transport: string;
  ownerUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

export interface OrgSharedArtifact {
  organizationId: string;
  publishedArtifactId: string;
  token: string;
  artifactId: string;
  title: string;
  kind: string;
  /** `organization` means the public link is closed and only members can open it. */
  visibility: 'public' | 'organization';
  ownerUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

export interface OrgSharedConversation {
  organizationId: string;
  sharedSessionId: string;
  token: string;
  title: string;
  messageCount: number;
  /** `organization` means the public link is closed and only members can open it. */
  visibility: 'public' | 'organization';
  ownerUserId: string;
  sharedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrgSharingMember {
  userId: string;
  role: OrgSharingRole;
  joinedAt: string;
  displayName: string | null;
  email: string | null;
  canEditProjects: boolean;
}

export interface OrgSharedOverview {
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrgSharingRole;
  canManageSharing: boolean;
  canShareOwnProjects: boolean;
  members: OrgSharingMember[];
  sharedProjects: OrgSharedProject[];
  sharedConnectors: OrgSharedConnector[];
  sharedArtifacts: OrgSharedArtifact[];
  sharedConversations: OrgSharedConversation[];
}

const ORG_SHARED_QUERY_KEY = ['settings', 'organization', 'shared'] as const;

/**
 * What the caller's organization shares, and who can see it.
 *
 * Returns `null` when the caller belongs to no organization, the API answers
 * 403 in that case, which is a legitimate state for a personal account, not an
 * error worth surfacing as a red banner.
 */
export function useOrganizationSharedOverview(): UseQueryResult<OrgSharedOverview | null, Error> {
  return useQuery<OrgSharedOverview | null, Error>({
    queryKey: ORG_SHARED_QUERY_KEY,
    queryFn: async (): Promise<OrgSharedOverview | null> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch('/api/settings/organization/shared', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));

      return (await res.json()) as OrgSharedOverview;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    meta: { errorMessage: 'Failed to load organization sharing' },
  });
}

async function sharingRequest(path: string, method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown) {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const csrfToken = await getCsrfToken();

  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<unknown>;
}

export type ProjectShareAudience = 'workspace' | 'invited';

/**
 * Share one of the caller's own projects with their organization, open to the
 * whole workspace or only to the members given access.
 */
export function useShareProjectWithOrganization(): UseMutationResult<
  unknown,
  Error,
  { projectId: string; audience: ProjectShareAudience }
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, { projectId: string; audience: ProjectShareAudience }>({
    mutationFn: ({ projectId, audience }) =>
      sharingRequest(`/api/settings/organization/shared/projects/${projectId}`, 'PUT', {
        audience,
      }),
    onSuccess: (_data, { audience }) => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(
        audience === 'invited'
          ? 'Project shared with the people you invite'
          : 'Project shared with your workspace',
      );
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

export function useUnshareProjectFromOrganization(): UseMutationResult<unknown, Error, string> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (projectId: string) =>
      sharingRequest(`/api/settings/organization/shared/projects/${projectId}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project is no longer shared');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

/**
 * Set one member's access to a shared project. `inherit` removes the override;
 * `none` is an explicit denial that the database itself honours; `write` is the
 * editor grant the project routes read before allowing a non-owner to save.
 */
export function useSetSharedProjectMemberAccess(): UseMutationResult<
  unknown,
  Error,
  { projectId: string; userId: string; access: OrgMemberProjectAccess | 'inherit' }
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { projectId: string; userId: string; access: OrgMemberProjectAccess | 'inherit' }
  >({
    mutationFn: ({ projectId, userId, access }) =>
      sharingRequest(`/api/settings/organization/shared/projects/${projectId}`, 'PATCH', {
        userId,
        access,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      toast.success('Access updated');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

export function useSetSharedProjectMembersAccess(): UseMutationResult<
  void,
  Error,
  { projectId: string; userIds: string[]; access: OrgMemberProjectAccess }
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { projectId: string; userIds: string[]; access: OrgMemberProjectAccess }
  >({
    mutationFn: async ({ projectId, userIds, access }) => {
      for (const userId of userIds) {
        await sharingRequest(`/api/settings/organization/shared/projects/${projectId}`, 'PATCH', {
          userId,
          access,
        });
      }
    },
    onSuccess: (_result, { userIds }) => {
      toast.success(
        translateUiPlural('settings', 'counts.accessUpdated', userIds.length, {
          one: 'Access updated',
          other: 'Access updated for {{count}} people',
        }),
      );
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY }),
  });
}

export function useUnshareConnectorFromOrganization(): UseMutationResult<unknown, Error, string> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (connectorRowId: string) =>
      sharingRequest(`/api/settings/organization/shared/connectors/${connectorRowId}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      toast.success('Connector is no longer shared');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

/**
 * Withdraw one artifact from the workspace. The artifact is not made public in
 * its place: it returns to being its owner's alone until they pick an audience
 * again from the artifact panel.
 */
export function useUnshareArtifactFromOrganization(): UseMutationResult<unknown, Error, string> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (publishedArtifactId: string) =>
      sharingRequest(
        `/api/settings/organization/shared/artifacts/${publishedArtifactId}`,
        'DELETE',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['settings', 'published-artifacts'] });
      toast.success('Artifact is no longer shared');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

/**
 * Withdraw one conversation from the workspace. The share is not reopened to
 * the public in its place: it returns to being its owner's alone until they
 * pick an audience again from the share dialog.
 */
export function useUnshareConversationFromOrganization(): UseMutationResult<
  unknown,
  Error,
  string
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (sharedSessionId: string) =>
      sharingRequest(
        `/api/settings/organization/shared/conversations/${sharedSessionId}`,
        'DELETE',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      toast.success('Conversation is no longer shared');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

export function useShareConnectorWithOrganization(): UseMutationResult<unknown, Error, string> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (connectorRowId: string) =>
      sharingRequest(`/api/settings/organization/shared/connectors/${connectorRowId}`, 'PUT'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      toast.success('Connector shared with your organization');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

// ── Workspace policy (organization_admin_policies) ─────────────────────────

export type WorkspaceAdminPolicy = AdminPolicy;
type WorkspaceAdminPolicyPatch = Partial<
  Omit<WorkspaceAdminPolicy, 'organizationId' | 'updatedAt' | 'controls'>
> & { controls?: Partial<WorkspaceAdminPolicy['controls']> };

export interface WorkspacePolicyOverview {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  currentUserRole: OrgSharingRole;
  policy: WorkspaceAdminPolicy;
}

const ORG_POLICY_QUERY_KEY = ['settings', 'organization', 'policy'] as const;

/**
 * The workspace's administrative policy.
 *
 * `null` means the caller belongs to no organization, or their plan does not
 * include team administration, both are 403s and both are legitimate states
 * for a personal account, so neither is surfaced as an error.
 *
 * `configured: false` means no policy row exists. The `policy` field then holds
 * the values a first save WOULD write, not values in force: an unconfigured
 * workspace is ungoverned. The UI must keep that distinction visible.
 */
export function useWorkspacePolicy(): UseQueryResult<WorkspacePolicyOverview | null, Error> {
  return useQuery<WorkspacePolicyOverview | null, Error>({
    queryKey: ORG_POLICY_QUERY_KEY,
    queryFn: async (): Promise<WorkspacePolicyOverview | null> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch('/api/settings/organization/policy', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));

      return (await res.json()) as WorkspacePolicyOverview;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    meta: { errorMessage: 'Failed to load workspace policy' },
  });
}

export function useUpdateWorkspacePolicy(): UseMutationResult<
  WorkspacePolicyOverview,
  Error,
  WorkspaceAdminPolicyPatch
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<
    WorkspacePolicyOverview,
    Error,
    WorkspaceAdminPolicyPatch
  >({
    mutationFn: async (patch) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();

      const res = await fetch('/api/settings/organization/policy', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          ...patch,
          controls: patch.controls && {
            featureAccess: patch.controls.featureAccess,
            defaultModelId: patch.controls.defaultModelId,
            maxReasoningEffort: patch.controls.maxReasoningEffort,
            allowedCountries: patch.controls.allowedCountries,
            allowedSurfaces: patch.controls.allowedSurfaces,
          },
        }),
      });

      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as WorkspacePolicyOverview;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ORG_POLICY_QUERY_KEY, data);
      toast.success('Workspace policy saved');
    },
    onError: (error: Error) =>
      toast.error(toUserMessage(error, 'The request failed. Please try again.')),
  });
}

// ── Enterprise audit trail ─────────────────────────────────────────────────

export interface AuditEventView {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  surface: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'success' | 'failure' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditQuery {
  action?: string;
  outcome?: '' | 'success' | 'failure' | 'denied';
  severity?: '' | 'info' | 'warning' | 'critical';
  from?: string;
  to?: string;
}

export interface AuditPageResult {
  organizationId: string;
  events: AuditEventView[];
  nextCursor: { createdAt: string; id: string } | null;
  facets?: { actions: string[]; resourceTypes: string[]; actors: string[] };
}

export function auditQueryToParams(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  return params;
}

const ORG_AUDIT_QUERY_KEY = ['settings', 'organization', 'audit'] as const;

/**
 * The workspace audit trail. `null` means the caller is not an owner/admin of
 * an entitled organization, a 403, which is a legitimate state for a personal
 * account or a plain member rather than an error worth a red banner.
 */
export function useWorkspaceAudit(
  query: AuditQuery,
): UseQueryResult<AuditPageResult | null, Error> {
  return useQuery<AuditPageResult | null, Error>({
    queryKey: [...ORG_AUDIT_QUERY_KEY, query],
    queryFn: async (): Promise<AuditPageResult | null> => {
      const params = auditQueryToParams(query);
      params.set('facets', 'true');

      const res = await fetch(`/api/settings/organization/audit?${params.toString()}`, {
        credentials: 'same-origin',
      });

      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));

      return (await res.json()) as AuditPageResult;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    meta: { errorMessage: 'Failed to load the audit trail' },
  });
}
