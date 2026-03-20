/**
 * Team RBAC Store
 *
 * Manages team state with role-based access control.
 * Roles: admin (full access), editor (create/edit), viewer (read-only).
 * Persisted to localStorage via Zustand persist middleware.
 *
 * Mutating actions call the /api/teams API routes and update local state
 * on success. fetchTeams() hydrates from the server.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCsrfToken } from '@/lib/client/csrf';

// ============================================================================
// Types
// ============================================================================

export type TeamRole = 'admin' | 'editor' | 'viewer';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: string;
}

interface TeamState {
  teams: Team[];
  activeTeamId: string | null;
  /** True while fetchTeams() is in-flight. */
  loading: boolean;
}

interface TeamActions {
  /** Hydrate teams from the API. */
  fetchTeams: () => Promise<void>;
  /** Fetch a single team with members from the API and merge into local state. */
  fetchTeamDetail: (teamId: string) => Promise<void>;
  createTeam: (name: string, description: string, creatorUserId?: string) => string;
  /** Async version that calls the API. Returns the new team id on success. */
  createTeamAsync: (name: string, description: string) => Promise<string>;
  updateTeam: (teamId: string, updates: Partial<Pick<Team, 'name' | 'description'>>) => void;
  /** Async version that calls the API. */
  updateTeamAsync: (
    teamId: string,
    updates: Partial<Pick<Team, 'name' | 'description'>>,
  ) => Promise<void>;
  deleteTeam: (teamId: string) => void;
  /** Async version that calls the API. */
  deleteTeamAsync: (teamId: string) => Promise<void>;
  inviteMember: (teamId: string, email: string, role: TeamRole) => void;
  /** Async version that calls the API. */
  inviteMemberAsync: (
    teamId: string,
    email: string,
    role: TeamRole,
    name?: string,
  ) => Promise<void>;
  updateMemberRole: (teamId: string, memberId: string, role: TeamRole) => void;
  /** Async version that calls the API. */
  updateMemberRoleAsync: (teamId: string, memberId: string, role: TeamRole) => Promise<void>;
  removeMember: (teamId: string, memberId: string) => void;
  /** Async version that calls the API. */
  removeMemberAsync: (teamId: string, memberId: string) => Promise<void>;
  setActiveTeam: (teamId: string | null) => void;
  getActiveTeam: () => Team | null;
  getMemberRole: (teamId: string, userId: string) => TeamRole | null;
  canManageMembers: (teamId: string, userId: string) => boolean;
  canEdit: (teamId: string, userId: string) => boolean;
  reset: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Role permission helpers
// ============================================================================

/** Roles that can manage team members (invite, change roles, remove). */
const MANAGE_ROLES: ReadonlySet<TeamRole> = new Set(['admin']);

/** Roles that can create and edit projects/conversations. */
const EDIT_ROLES: ReadonlySet<TeamRole> = new Set(['admin', 'editor']);

// ============================================================================
// Store
// ============================================================================

const INITIAL_STATE: TeamState = {
  teams: [],
  activeTeamId: null,
  loading: false,
};

export const useTeamStore = create<TeamState & TeamActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // -----------------------------------------------------------------------
      // API-backed fetch
      // -----------------------------------------------------------------------

      fetchTeams: async () => {
        set({ loading: true });
        try {
          const res = await fetch('/api/teams', { credentials: 'include' });
          if (!res.ok) throw new Error(`Failed to fetch teams: ${res.statusText}`);
          const data = await res.json();
          // The API returns teams without nested members — we keep existing
          // member data if we have it, or start with empty arrays.
          const existingTeamsById = Object.fromEntries(get().teams.map((t) => [t.id, t]));
          const teams: Team[] = (data.teams || []).map((t: Record<string, unknown>) => ({
            id: t['id'] as string,
            name: t['name'] as string,
            description: (t['description'] as string) ?? '',
            ownerId: t['ownerId'] as string,
            members: existingTeamsById[t['id'] as string]?.members ?? [],
            createdAt: t['createdAt'] as string,
          }));
          set({ teams, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      fetchTeamDetail: async (teamId) => {
        try {
          const res = await fetch(`/api/teams/${teamId}`, { credentials: 'include' });
          if (!res.ok) throw new Error(`Failed to fetch team: ${res.statusText}`);
          const data = await res.json();
          const apiTeam = data.team;
          const members: TeamMember[] = (apiTeam.members || []).map(
            (m: Record<string, unknown>) => ({
              id: m['id'] as string,
              userId: m['userId'] as string,
              email: m['email'] as string,
              name: (m['name'] as string) ?? '',
              role: m['role'] as TeamRole,
              joinedAt: m['joinedAt'] as string,
            }),
          );
          const team: Team = {
            id: apiTeam['id'],
            name: apiTeam['name'],
            description: apiTeam['description'] ?? '',
            ownerId: apiTeam['ownerId'],
            members,
            createdAt: apiTeam['createdAt'],
          };
          set((state) => {
            const idx = state.teams.findIndex((t) => t.id === teamId);
            if (idx >= 0) {
              const updated = [...state.teams];
              updated[idx] = team;
              return { teams: updated };
            }
            return { teams: [...state.teams, team] };
          });
        } catch {
          // Silently fail — UI can retry
        }
      },

      // -----------------------------------------------------------------------
      // Local-only mutations (preserved for backward compatibility)
      // -----------------------------------------------------------------------

      createTeam: (name, description, creatorUserId?) => {
        const id = generateId();
        const now = new Date().toISOString();
        const resolvedCreatorId = creatorUserId ?? generateId();
        const ownerMember: TeamMember = {
          id: generateId(),
          userId: resolvedCreatorId,
          email: '',
          name: 'You',
          role: 'admin',
          joinedAt: now,
        };
        const team: Team = {
          id,
          name,
          description,
          ownerId: resolvedCreatorId,
          members: [ownerMember],
          createdAt: now,
        };
        set((state) => ({ teams: [...state.teams, team] }));
        return id;
      },

      updateTeam: (teamId, updates) =>
        set((state) => ({
          teams: state.teams.map((t) => (t.id === teamId ? { ...t, ...updates } : t)),
        })),

      deleteTeam: (teamId) =>
        set((state) => ({
          teams: state.teams.filter((t) => t.id !== teamId),
          activeTeamId: state.activeTeamId === teamId ? null : state.activeTeamId,
        })),

      inviteMember: (teamId, email, role) => {
        const memberId = generateId();
        const now = new Date().toISOString();
        const member: TeamMember = {
          id: memberId,
          userId: memberId,
          email,
          name: email.split('@')[0] ?? email,
          role,
          joinedAt: now,
        };
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, members: [...t.members, member] } : t,
          ),
        }));
      },

      updateMemberRole: (teamId, memberId, role) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId
              ? {
                  ...t,
                  members: t.members.map((m) => (m.id === memberId ? { ...m, role } : m)),
                }
              : t,
          ),
        })),

      removeMember: (teamId, memberId) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t,
          ),
        })),

      // -----------------------------------------------------------------------
      // API-backed mutations
      // -----------------------------------------------------------------------

      createTeamAsync: async (name, description) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch('/api/teams', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ name, description }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to create team');
        }
        const data = await res.json();
        const apiTeam = data.team;
        const team: Team = {
          id: apiTeam['id'],
          name: apiTeam['name'],
          description: apiTeam['description'] ?? '',
          ownerId: apiTeam['ownerId'],
          members: [],
          createdAt: apiTeam['createdAt'],
        };
        set((state) => ({ teams: [...state.teams, team] }));
        return team.id;
      },

      updateTeamAsync: async (teamId, updates) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to update team');
        }
        set((state) => ({
          teams: state.teams.map((t) => (t.id === teamId ? { ...t, ...updates } : t)),
        }));
      },

      deleteTeamAsync: async (teamId) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/teams/${teamId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to delete team');
        }
        set((state) => ({
          teams: state.teams.filter((t) => t.id !== teamId),
          activeTeamId: state.activeTeamId === teamId ? null : state.activeTeamId,
        }));
      },

      inviteMemberAsync: async (teamId, email, role, name?) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/teams/${teamId}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ email, role, name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to invite member');
        }
        const data = await res.json();
        const m = data.member;
        const member: TeamMember = {
          id: m['id'],
          userId: m['userId'],
          email: m['email'],
          name: m['name'] ?? '',
          role: m['role'],
          joinedAt: m['joinedAt'],
        };
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, members: [...t.members, member] } : t,
          ),
        }));
      },

      updateMemberRoleAsync: async (teamId, memberId, role) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/teams/${teamId}/members`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ memberId, role }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to update role');
        }
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId
              ? { ...t, members: t.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }
              : t,
          ),
        }));
      },

      removeMemberAsync: async (teamId, memberId) => {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/teams/${teamId}/members?memberId=${memberId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Failed to remove member');
        }
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t,
          ),
        }));
      },

      // -----------------------------------------------------------------------
      // Non-mutating accessors
      // -----------------------------------------------------------------------

      setActiveTeam: (teamId) => set({ activeTeamId: teamId }),

      getActiveTeam: () => {
        const { teams, activeTeamId } = get();
        if (!activeTeamId) return null;
        return teams.find((t) => t.id === activeTeamId) ?? null;
      },

      getMemberRole: (teamId, userId) => {
        const team = get().teams.find((t) => t.id === teamId);
        if (!team) return null;
        // Owner always has admin-level access
        if (team.ownerId === userId) return 'admin';
        const member = team.members.find((m) => m.userId === userId);
        return member?.role ?? null;
      },

      canManageMembers: (teamId, userId) => {
        const role = get().getMemberRole(teamId, userId);
        return role !== null && MANAGE_ROLES.has(role);
      },

      canEdit: (teamId, userId) => {
        const role = get().getMemberRole(teamId, userId);
        return role !== null && EDIT_ROLES.has(role);
      },

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'agi-team-store',
      version: 1,
      // Don't persist loading state
      partialize: (state) => ({
        teams: state.teams,
        activeTeamId: state.activeTeamId,
      }),
    },
  ),
);

// ============================================================================
// Static accessors (for use outside React components)
// ============================================================================

/** Get the currently active team outside of React. */
export function getActiveTeam(): Team | null {
  return useTeamStore.getState().getActiveTeam();
}

/** Check if a user can edit in a team outside of React. */
export function canUserEdit(teamId: string, userId: string): boolean {
  return useTeamStore.getState().canEdit(teamId, userId);
}
