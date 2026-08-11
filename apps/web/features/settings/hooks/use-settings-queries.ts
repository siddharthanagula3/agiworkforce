/**
 * Settings React Query Hooks
 * Server state management for user settings and profile using React Query
 *
 * @module features/settings/hooks/use-settings-queries
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { queryKeys } from '@shared/stores/query-client';
import settingsService, {
  type UserProfile,
  type UserSettings,
  type APIKey,
} from '../services/user-preferences';
import { toast } from 'sonner';
import { logger } from '@shared/lib/logger';
import { TimeoutPresets, withTimeout } from '@shared/lib/error-utils';
import { requireProviderDefaultModel, type BillingPlanTier } from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { CreateApiKeyFormData } from '../schemas/settings-validation';

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

/**
 * Password change parameters
 */
export interface ChangePasswordParams {
  newPassword: string;
  confirmPassword: string;
}

/**
 * Optimistic update context for profile mutations
 */
interface ProfileMutationContext {
  previousProfile: UserProfile | null | undefined;
}

/**
 * Optimistic update context for settings mutations
 */
interface SettingsMutationContext {
  previousSettings: UserSettings | undefined;
}

/**
 * Combined settings data result
 */
export interface AllSettingsData {
  profile: UserProfile | null | undefined;
  settings: UserSettings | undefined;
  apiKeys: APIKey[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch user profile
 *
 * @returns UseQueryResult with UserProfile or null
 */
export function useUserProfile(): UseQueryResult<UserProfile | null, Error> {
  return useQuery<UserProfile | null, Error>({
    queryKey: queryKeys.settings.profile(),
    queryFn: async (): Promise<UserProfile | null> => {
      const { data, error } = await settingsService.getProfile();
      if (error) {
        logger.error('[SettingsQuery] Profile error:', error);
        return null;
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - profile rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    meta: {
      errorMessage: 'Failed to load user profile',
    },
  });
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
      if (error) {
        // A signed-out visitor is an expected state, not an error — don't spam
        // the console (it surfaced as a Next dev "Issue" overlay on public routes).
        if (!/not authenticated|authentication required|unauthorized/i.test(String(error))) {
          logger.error('[SettingsQuery] Settings error:', error);
        }
        // Return default settings on error
        return {
          email_notifications: true,
          push_notifications: true,
          workflow_alerts: true,
          employee_updates: true,
          system_maintenance: true,
          marketing_emails: false,
          weekly_reports: true,
          instant_alerts: true,
          two_factor_enabled: false,
          session_timeout: 60,
          theme: 'dark',
          auto_save: true,
          debug_mode: false,
          analytics_enabled: true,
          cache_size: '1GB',
          backup_frequency: 'daily',
          retention_period: 30,
          max_concurrent_jobs: 10,
          default_ai_provider: 'openai',
          // MODEL-IDS-HARDCODED fix per UNIFIED_LAUNCH_PLAN.md §1: read from models.json catalog
          default_ai_model: requireProviderDefaultModel('openai'),
          prefer_streaming: true,
          ai_temperature: 0.7,
          ai_max_tokens: 4000,
        };
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    meta: {
      errorMessage: 'Failed to load user settings',
    },
  });
}

/**
 * Fetch API keys
 *
 * @returns UseQueryResult with array of APIKey
 */
export function useAPIKeys(): UseQueryResult<APIKey[], Error> {
  return useQuery<APIKey[], Error>({
    queryKey: queryKeys.settings.apiKeys(),
    queryFn: async ({ signal }): Promise<APIKey[]> => {
      const timeoutSignal = AbortSignal.timeout(TimeoutPresets.FAST);
      const requestSignal = AbortSignal.any([signal, timeoutSignal]);

      try {
        const { data, error } = await withTimeout(
          settingsService.getAPIKeys(requestSignal),
          TimeoutPresets.FAST,
          'API keys took too long to load.',
        );
        if (error) throw new Error(error);
        return data;
      } catch (error) {
        const message = timeoutSignal.aborted
          ? 'API keys took too long to load. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Unable to load API keys.';
        logger.error('[SettingsQuery] API keys error:', message);
        throw new Error(message);
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    meta: {
      errorMessage: 'Failed to load API keys',
    },
  });
}

/**
 * Update user profile mutation
 *
 * @returns UseMutationResult for updating user profile
 */
export function useUpdateProfile(): UseMutationResult<
  Partial<UserProfile>,
  Error,
  Partial<UserProfile>,
  ProfileMutationContext
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<Partial<UserProfile>, Error, Partial<UserProfile>, ProfileMutationContext>({
    mutationFn: async (profile: Partial<UserProfile>): Promise<Partial<UserProfile>> => {
      const { error } = await settingsService.updateProfile(profile);
      if (error) {
        throw new Error(error);
      }
      return profile;
    },
    onMutate: async (newProfile: Partial<UserProfile>): Promise<ProfileMutationContext> => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.settings.profile(),
      });

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData<UserProfile | null>(
        queryKeys.settings.profile(),
      );

      // Optimistically update
      queryClient.setQueryData<UserProfile | null>(queryKeys.settings.profile(), (old) =>
        old ? { ...old, ...newProfile } : null,
      );

      return { previousProfile };
    },
    onSuccess: (): void => {
      toast.success('Profile updated successfully');
    },
    onError: (
      error: Error,
      _variables: Partial<UserProfile>,
      context: ProfileMutationContext | undefined,
    ): void => {
      // Rollback on error
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData(queryKeys.settings.profile(), context.previousProfile);
      }
      logger.error('Failed to save profile:', error);
      toast.error('Failed to save profile');
    },
    onSettled: (): void => {
      // Always refetch after mutation
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.profile(),
      });
    },
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

/**
 * Upload avatar mutation
 *
 * @returns UseMutationResult for uploading avatar
 */
export function useUploadAvatar(): UseMutationResult<string, Error, File> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<string, Error, File>({
    mutationFn: async (file: File): Promise<string> => {
      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File size must be less than 5MB');
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      const { data: url, error } = await settingsService.uploadAvatar(file);
      if (error) {
        throw new Error(error);
      }
      return url;
    },
    onSuccess: (url: string): void => {
      // Update profile with new avatar URL
      queryClient.setQueryData<UserProfile | null>(queryKeys.settings.profile(), (old) =>
        old ? { ...old, avatar_url: url } : null,
      );
      toast.success('Avatar uploaded successfully');
    },
    onError: (error: Error): void => {
      logger.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload avatar');
    },
  });
}

/**
 * Change password mutation
 *
 * @returns UseMutationResult for changing password
 */
export function useChangePassword(): UseMutationResult<void, Error, ChangePasswordParams> {
  return useMutation<void, Error, ChangePasswordParams>({
    mutationFn: async ({ newPassword, confirmPassword }: ChangePasswordParams): Promise<void> => {
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      const { error } = await settingsService.changePassword(newPassword);
      if (error) {
        throw new Error(error);
      }
    },
    onSuccess: (): void => {
      toast.success('Password changed successfully');
    },
    onError: (error: Error): void => {
      logger.error('Error changing password:', error);
      toast.error(error.message || 'Failed to change password');
    },
  });
}

/**
 * Create API key mutation
 *
 * @returns UseMutationResult for creating API key
 */
export function useCreateAPIKey(): UseMutationResult<
  CreateAPIKeyResult,
  Error,
  CreateApiKeyFormData
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<CreateAPIKeyResult, Error, CreateApiKeyFormData>({
    mutationFn: async ({ name, scopes }: CreateApiKeyFormData): Promise<CreateAPIKeyResult> => {
      if (!name.trim()) {
        throw new Error('Please enter a name for the API key');
      }

      const { data, error, fullKey } = await settingsService.createAPIKey(name, scopes);
      if (error || !data) {
        throw new Error(error || 'Failed to create API key');
      }

      return { apiKey: data, fullKey: fullKey || '' };
    },
    onSuccess: ({ apiKey }: CreateAPIKeyResult): void => {
      // Add to cache
      queryClient.setQueryData<APIKey[]>(queryKeys.settings.apiKeys(), (old) =>
        old ? [apiKey, ...old] : [apiKey],
      );
      toast.success('API key generated successfully');
    },
    onError: (error: Error): void => {
      logger.error('Error generating API key:', error);
      toast.error(error.message || 'Failed to generate API key');
    },
  });
}

/**
 * Delete API key mutation
 *
 * @returns UseMutationResult for deleting API key
 */
export function useDeleteAPIKey(): UseMutationResult<string, Error, string> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<string, Error, string>({
    mutationFn: async (keyId: string): Promise<string> => {
      const { error } = await settingsService.deleteAPIKey(keyId);
      if (error) {
        throw new Error(error);
      }
      return keyId;
    },
    onSuccess: (keyId: string): void => {
      // Remove from cache
      queryClient.setQueryData<APIKey[]>(queryKeys.settings.apiKeys(), (old) =>
        old?.filter((k) => k.id !== keyId),
      );
      toast.success('API key deleted successfully');
    },
    onError: (error: Error): void => {
      logger.error('Error deleting API key:', error);
      toast.error(error.message || 'Failed to delete API key');
    },
  });
}

/**
 * Toggle 2FA mutation
 *
 * @returns UseMutationResult for toggling 2FA
 */
export function useToggle2FA(): UseMutationResult<
  boolean,
  Error,
  boolean,
  SettingsMutationContext
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<boolean, Error, boolean, SettingsMutationContext>({
    mutationFn: async (enabled: boolean): Promise<boolean> => {
      if (enabled) {
        // Enabling 2FA is a multi-step enrollment (setup -> scan QR -> verify a
        // TOTP code). enable2FA() only performs SETUP; the server keeps 2FA OFF
        // until a code is verified. Reporting success here would be a lie, so we
        // surface that verification is still required rather than flipping the
        // flag. (Full enrollment dialog is tracked as a follow-up.)
        const { error } = await settingsService.enable2FA();
        if (error) {
          throw new Error(error);
        }
        throw new Error(
          'Two-factor setup started · enabling still requires verifying a code from your authenticator app. This step is not available yet.',
        );
      }

      const { error } = await settingsService.disable2FA('');
      if (error) {
        throw new Error(error);
      }
      return false;
    },
    onMutate: async (enabled: boolean): Promise<SettingsMutationContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.settings.preferences(),
      });

      const previousSettings = queryClient.getQueryData<UserSettings>(
        queryKeys.settings.preferences(),
      );

      // Only optimistically reflect a DISABLE (which truly takes effect on
      // success). An enable is never real until a code is verified, so never
      // optimistically flip 2FA on.
      if (!enabled) {
        queryClient.setQueryData<UserSettings>(queryKeys.settings.preferences(), (old) =>
          old ? { ...old, two_factor_enabled: false } : old,
        );
      }

      return { previousSettings };
    },
    onSuccess: (enabled: boolean): void => {
      // Only a real disable reaches success; enable throws "verification
      // required" above, so it never falsely toasts "enabled".
      if (!enabled) {
        toast.success('2FA disabled successfully');
      }
    },
    onError: (
      error: Error,
      enabled: boolean,
      context: SettingsMutationContext | undefined,
    ): void => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.settings.preferences(), context.previousSettings);
      }
      logger.error('Error toggling 2FA:', error);
      toast.error(error.message || `Failed to ${enabled ? 'enable' : 'disable'} 2FA`);
    },
  });
}

/**
 * Invalidate all settings queries
 *
 * @returns Callback function to invalidate all settings queries
 */
export function useInvalidateSettingsQueries(): () => void {
  const queryClient: QueryClient = useQueryClient();

  return (): void => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all() });
  };
}

/**
 * Combined hook for loading all settings data at once
 * Useful for settings page initialization
 *
 * @returns AllSettingsData with combined query results
 */
export function useAllSettingsData(): AllSettingsData {
  const profileQuery = useUserProfile();
  const settingsQuery = useUserSettings();
  const apiKeysQuery = useAPIKeys();

  return {
    profile: profileQuery.data,
    settings: settingsQuery.data,
    apiKeys: apiKeysQuery.data ?? [],
    isLoading: profileQuery.isLoading || settingsQuery.isLoading || apiKeysQuery.isLoading,
    isError: profileQuery.isError || settingsQuery.isError || apiKeysQuery.isError,
    error: profileQuery.error || settingsQuery.error || apiKeysQuery.error,
    refetch: (): void => {
      profileQuery.refetch();
      settingsQuery.refetch();
      apiKeysQuery.refetch();
    },
  };
}

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

async function readApiError(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  const body = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
  if (typeof body?.error === 'string' && body.error.trim()) {
    return body.error;
  }
  if (
    body?.error &&
    typeof body.error === 'object' &&
    typeof body.error.message === 'string' &&
    body.error.message.trim()
  ) {
    return body.error.message;
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

export function useSwitchWorkspace(): UseMutationResult<void, Error, string | null> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string | null>({
    mutationFn: async (organizationId) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/settings/organization/active', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success('Workspace switched');
      window.location.reload();
    },
    onError: (error) => toast.error(error.message || 'Failed to switch workspace'),
  });
}

/**
 * Fetch organization settings
 *
 * @param organizationId - Optional organization ID (uses user's org if not provided)
 * @returns UseQueryResult with OrganizationSettings or null
 */
export function useOrganizationSettings(
  organizationId?: string,
): UseQueryResult<OrganizationSettings | null, Error> {
  void organizationId; // compatibility only; the route returns the durable active workspace
  return useQuery<OrganizationOverview, Error, OrganizationSettings | null>({
    queryKey: ['settings', 'organization', 'current'],
    queryFn: fetchOrganizationOverview,
    select: (overview) => overview.organization,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load organization settings',
    },
  });
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export function useCreateOrganization(): UseMutationResult<
  OrganizationSettings,
  Error,
  CreateOrganizationInput
> {
  const queryClient = useQueryClient();

  return useMutation<OrganizationSettings, Error, CreateOrganizationInput>({
    mutationFn: async (input) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();

      const response = await fetch('/api/settings/organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as { organization?: OrganizationSettings };
      if (!body.organization) throw new Error('Invalid response from server');
      return body.organization;
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success('Workspace created');
      window.location.reload();
    },
    onError: (error) => {
      logger.error('Failed to create workspace:', error);
      toast.error(error.message || 'Failed to create workspace');
    },
  });
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
    mutationFn: async ({ updates }): Promise<OrganizationSettings> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const response = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
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
      return json.members ?? [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    meta: {
      errorMessage: 'Failed to load team members',
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
  delivery: {
    emailSent: false;
    reason: string;
  };
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
  delivery: z.object({
    emailSent: z.literal(false),
    reason: z.string(),
  }),
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
    onError: (error: Error) => toast.error(error.message || 'Failed to create invitation'),
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
    onError: (error: Error) => toast.error(error.message || 'Failed to renew invitation'),
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
    onError: (error: Error) => toast.error(error.message || 'Failed to revoke invitation'),
  });
}

export function useLeaveOrganization(): UseMutationResult<
  void,
  Error,
  { successorUserId?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ successorUserId }) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/settings/organization/leave', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(successorUserId ? { successorUserId } : {}),
      });
      if (!response.ok) throw new Error(await readApiError(response));
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success('You left the workspace. You can now join or create another one.');
      window.location.reload();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to leave workspace'),
  });
}

/**
 * Add an existing AGI account to the team.
 *
 * The legacy hook name is retained for compatibility; this does not send an
 * invitation email and the server rejects unknown account addresses.
 */
export function useInviteTeamMember(): UseMutationResult<
  TeamMember,
  Error,
  { organizationId: string; email: string; role: TeamMember['role'] }
> {
  const queryClient: QueryClient = useQueryClient();

  return useMutation<
    TeamMember,
    Error,
    { organizationId: string; email: string; role: TeamMember['role'] }
  >({
    mutationFn: async ({
      organizationId,
      email,
      role,
    }: {
      organizationId: string;
      email: string;
      role: TeamMember['role'];
    }): Promise<TeamMember> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const csrfToken = await getCsrfToken();

      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ organizationId, email, role }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const json = (await res.json()) as { member: TeamMember };
      if (!json.member) throw new Error('Invalid response from server');
      return json.member;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: ['settings', 'team', organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      toast.success('Team member added');
    },
    onError: (error: Error) => {
      logger.error('Failed to add team member:', error);
      toast.error(error.message || 'Failed to add team member');
    },
  });
}

/**
 * Remove team member mutation
 *
 * @returns UseMutationResult for removing a team member
 */
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
  userId: string;
  type: 'login' | 'logout' | 'settings_change' | 'api_call' | 'chat_session' | 'payment' | 'other';
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Fetch user activity history
 *
 * @param userId - Optional user ID (uses current user if not provided)
 * @param limit - Maximum number of records
 * @returns UseQueryResult with array of UserActivity
 */
export function useUserActivity(
  userId?: string,
  limit: number = 50,
): UseQueryResult<UserActivity[], Error> {
  void userId; // current user is resolved server-side from auth token
  return useQuery<UserActivity[], Error>({
    queryKey: ['settings', 'activity', userId ?? 'current', limit],
    queryFn: async (): Promise<UserActivity[]> => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/settings/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
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

// ============================================================================
// AUDIT LOGS HOOKS
// ============================================================================

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  user?: {
    email: string;
    name: string;
  };
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
export function useAuditLogs(filters?: AuditLogFilters): UseQueryResult<AuditLogEntry[], Error> {
  const {
    userId,
    action,
    resourceType,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters || {};

  return useQuery<AuditLogEntry[], Error>({
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
    queryFn: async (): Promise<AuditLogEntry[]> => {
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
        throw new Error(`HTTP ${res.status}`);
      }

      const json = (await res.json()) as { entries: AuditLogEntry[] };
      return json.entries ?? [];
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
        throw new Error(`HTTP ${res.status}`);
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
  defaultAccess: 'read' | 'write';
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

export interface OrgSharedOverview {
  organizationId: string;
  currentUserRole: OrgSharingRole;
  canManageSharing: boolean;
  members: { userId: string; role: OrgSharingRole; joinedAt: string }[];
  sharedProjects: OrgSharedProject[];
  sharedConnectors: OrgSharedConnector[];
}

const ORG_SHARED_QUERY_KEY = ['settings', 'organization', 'shared'] as const;

/**
 * What the caller's organization shares, and who can see it.
 *
 * Returns `null` when the caller belongs to no organization — the API answers
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

/** Share one of the caller's own projects with their organization. */
export function useShareProjectWithOrganization(): UseMutationResult<unknown, Error, string> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (projectId: string) =>
      sharingRequest(`/api/settings/organization/shared/projects/${projectId}`, 'PUT'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_SHARED_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project shared with your organization');
    },
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Set one member's access to a shared project. `inherit` removes the override;
 * `none` is an explicit denial that the database itself honours.
 */
export function useSetSharedProjectMemberAccess(): UseMutationResult<
  unknown,
  Error,
  { projectId: string; userId: string; access: 'read' | 'none' | 'inherit' }
> {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { projectId: string; userId: string; access: 'read' | 'none' | 'inherit' }
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
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });
}
