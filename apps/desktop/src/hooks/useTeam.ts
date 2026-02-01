/**
 * Team operations hook for AGI Workforce.
 *
 * Provides a convenient interface to Team operations via Tauri commands.
 * Handles loading states, error handling, and automatic data refresh.
 *
 * @module useTeam
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamResource,
  TeamSettings,
  TeamRole,
  ResourceType,
} from '../types/teams';

/**
 * Hook state and operations for Team management.
 */
export interface UseTeamReturn {
  /** Whether a team operation is in progress */
  loading: boolean;
  /** Last error message */
  error: string | null;

  /** List all members of a team */
  listMembers: (teamId: string) => Promise<TeamMember[]>;
  /** Invite a new member to the team */
  inviteMember: (
    teamId: string,
    email: string,
    role: TeamRole | string,
    invitedBy: string,
  ) => Promise<string>;
  /** Remove a member from the team */
  removeMember: (teamId: string, userId: string, removedBy: string) => Promise<void>;
  /** Update a member's role */
  updateRole: (
    teamId: string,
    userId: string,
    role: TeamRole | string,
    updatedBy: string,
  ) => Promise<void>;
  /** Get team settings (via get_team) */
  getSettings: (teamId: string) => Promise<TeamSettings | null>;
  /** Update team settings */
  updateSettings: (
    teamId: string,
    name?: string,
    description?: string | null,
    settings?: Partial<TeamSettings>,
  ) => Promise<void>;
  /** List shared resources for a team */
  listSharedResources: (teamId: string) => Promise<TeamResource[]>;
  /** Share a resource with the team */
  shareResource: (
    teamId: string,
    resourceType: ResourceType | string,
    resourceId: string,
    resourceName: string,
    resourceDescription: string | null,
    sharedBy: string,
  ) => Promise<void>;
  /** Unshare a resource from the team */
  unshareResource: (
    teamId: string,
    resourceType: ResourceType | string,
    resourceId: string,
    unsharedBy: string,
  ) => Promise<void>;
  /** Get team invitations */
  getInvitations: (teamId: string) => Promise<TeamInvitation[]>;
  /** Accept an invitation */
  acceptInvitation: (token: string, userId: string) => Promise<Team>;
  /** Get a specific team */
  getTeam: (teamId: string) => Promise<Team | null>;
  /** Get all teams for a user */
  getUserTeams: (userId: string) => Promise<Team[]>;
  /** Create a new team */
  createTeam: (name: string, description: string | null, ownerId: string) => Promise<Team>;
  /** Delete a team */
  deleteTeam: (teamId: string) => Promise<void>;
  /** Transfer team ownership */
  transferOwnership: (teamId: string, newOwnerId: string, transferredBy: string) => Promise<void>;
  /** Clear the error state */
  clearError: () => void;
}

/**
 * Hook for managing Team operations.
 *
 * @returns Team operations and state
 *
 * @example
 * ```tsx
 * const { listMembers, inviteMember, updateRole, loading, error } = useTeam();
 *
 * // List all members
 * const members = await listMembers('team-id');
 *
 * // Invite a new member
 * const token = await inviteMember('team-id', 'user@example.com', 'editor', 'current-user-id');
 *
 * // Update member role
 * await updateRole('team-id', 'user-id', 'admin', 'current-user-id');
 * ```
 */
export function useTeam(): UseTeamReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, operation: string) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    toast.error(`Team ${operation} failed: ${message}`);
    throw err;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const listMembers = useCallback(
    async (teamId: string): Promise<TeamMember[]> => {
      setLoading(true);
      setError(null);

      try {
        const members = await invoke<TeamMember[]>('get_team_members', { teamId });
        return members;
      } catch (err) {
        handleError(err, 'list members');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const inviteMember = useCallback(
    async (
      teamId: string,
      email: string,
      role: TeamRole | string,
      invitedBy: string,
    ): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        // TeamRole enum values are already strings, so we can safely cast
        const roleStr = String(role);
        const token = await invoke<string>('invite_member', {
          teamId,
          email,
          role: roleStr,
          invitedBy,
        });
        toast.success(`Invitation sent to ${email}`);
        return token;
      } catch (err) {
        handleError(err, 'invite member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const removeMember = useCallback(
    async (teamId: string, userId: string, removedBy: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('remove_member', { teamId, userId, removedBy });
        toast.success('Member removed from team');
      } catch (err) {
        handleError(err, 'remove member');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const updateRole = useCallback(
    async (
      teamId: string,
      userId: string,
      role: TeamRole | string,
      updatedBy: string,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // TeamRole enum values are already strings, so we can safely cast
        const roleStr = String(role);
        await invoke('update_member_role', {
          teamId,
          userId,
          role: roleStr,
          updatedBy,
        });
        toast.success('Member role updated');
      } catch (err) {
        handleError(err, 'update role');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const getSettings = useCallback(
    async (teamId: string): Promise<TeamSettings | null> => {
      setLoading(true);
      setError(null);

      try {
        const team = await invoke<Team | null>('get_team', { teamId });
        return team?.settings ?? null;
      } catch (err) {
        handleError(err, 'get settings');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const updateSettings = useCallback(
    async (
      teamId: string,
      name?: string,
      description?: string | null,
      settings?: Partial<TeamSettings>,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // Update basic team info (name, description) if provided
        if (name !== undefined || description !== undefined) {
          await invoke('update_team', {
            teamId,
            name: name ?? null,
            description: description ?? null,
          });
        }

        // Update team settings if provided
        if (settings) {
          await invoke('update_team_settings', {
            teamId,
            defaultMemberRole: settings.defaultMemberRole ?? null,
            allowResourceSharing: settings.allowResourceSharing ?? null,
            requireApprovalForAutomations: settings.requireApprovalForAutomations ?? null,
            enableActivityNotifications: settings.enableActivityNotifications ?? null,
            maxMembers: settings.maxMembers ?? null,
          });
        }

        toast.success('Team settings updated');
      } catch (err) {
        handleError(err, 'update settings');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const listSharedResources = useCallback(
    async (teamId: string): Promise<TeamResource[]> => {
      setLoading(true);
      setError(null);

      try {
        const resources = await invoke<TeamResource[]>('get_team_resources', { teamId });
        return resources;
      } catch (err) {
        handleError(err, 'list shared resources');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const shareResource = useCallback(
    async (
      teamId: string,
      resourceType: ResourceType | string,
      resourceId: string,
      resourceName: string,
      resourceDescription: string | null,
      sharedBy: string,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // ResourceType enum values are already strings, so we can safely cast
        const resourceTypeStr = String(resourceType);
        await invoke('share_resource', {
          teamId,
          resourceType: resourceTypeStr,
          resourceId,
          resourceName,
          resourceDescription,
          sharedBy,
        });
        toast.success(`${resourceName} shared with team`);
      } catch (err) {
        handleError(err, 'share resource');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const unshareResource = useCallback(
    async (
      teamId: string,
      resourceType: ResourceType | string,
      resourceId: string,
      unsharedBy: string,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        // ResourceType enum values are already strings, so we can safely cast
        const resourceTypeStr = String(resourceType);
        await invoke('unshare_resource', {
          teamId,
          resourceType: resourceTypeStr,
          resourceId,
          unsharedBy,
        });
        toast.success('Resource unshared from team');
      } catch (err) {
        handleError(err, 'unshare resource');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const getInvitations = useCallback(
    async (teamId: string): Promise<TeamInvitation[]> => {
      setLoading(true);
      setError(null);

      try {
        const invitations = await invoke<TeamInvitation[]>('get_team_invitations', { teamId });
        return invitations;
      } catch (err) {
        handleError(err, 'get invitations');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const acceptInvitation = useCallback(
    async (token: string, userId: string): Promise<Team> => {
      setLoading(true);
      setError(null);

      try {
        const team = await invoke<Team>('accept_invitation', { token, userId });
        toast.success(`Joined team: ${team.name}`);
        return team;
      } catch (err) {
        handleError(err, 'accept invitation');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const getTeam = useCallback(
    async (teamId: string): Promise<Team | null> => {
      setLoading(true);
      setError(null);

      try {
        const team = await invoke<Team | null>('get_team', { teamId });
        return team;
      } catch (err) {
        handleError(err, 'get team');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const getUserTeams = useCallback(
    async (userId: string): Promise<Team[]> => {
      setLoading(true);
      setError(null);

      try {
        const teams = await invoke<Team[]>('get_user_teams', { userId });
        return teams;
      } catch (err) {
        handleError(err, 'get user teams');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const createTeam = useCallback(
    async (name: string, description: string | null, ownerId: string): Promise<Team> => {
      setLoading(true);
      setError(null);

      try {
        const team = await invoke<Team>('create_team', { name, description, ownerId });
        toast.success(`Team "${name}" created`);
        return team;
      } catch (err) {
        handleError(err, 'create team');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const deleteTeam = useCallback(
    async (teamId: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('delete_team', { teamId });
        toast.success('Team deleted');
      } catch (err) {
        handleError(err, 'delete team');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const transferOwnership = useCallback(
    async (teamId: string, newOwnerId: string, transferredBy: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('transfer_team_ownership', { teamId, newOwnerId, transferredBy });
        toast.success('Team ownership transferred');
      } catch (err) {
        handleError(err, 'transfer ownership');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  return {
    loading,
    error,
    listMembers,
    inviteMember,
    removeMember,
    updateRole,
    getSettings,
    updateSettings,
    listSharedResources,
    shareResource,
    unshareResource,
    getInvitations,
    acceptInvitation,
    getTeam,
    getUserTeams,
    createTeam,
    deleteTeam,
    transferOwnership,
    clearError,
  };
}
