/**
 * Team RBAC Store
 *
 * Manages team state with role-based access control.
 * Roles: admin (full access), editor (create/edit), viewer (read-only).
 * Persisted to localStorage via Zustand persist middleware.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface TeamActions {
  createTeam: (name: string, description: string, creatorUserId?: string) => string;
  updateTeam: (teamId: string, updates: Partial<Pick<Team, 'name' | 'description'>>) => void;
  deleteTeam: (teamId: string) => void;
  inviteMember: (teamId: string, email: string, role: TeamRole) => void;
  updateMemberRole: (teamId: string, memberId: string, role: TeamRole) => void;
  removeMember: (teamId: string, memberId: string) => void;
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
};

export const useTeamStore = create<TeamState & TeamActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      createTeam: (name, description, creatorUserId?) => {
        const id = generateId();
        const now = new Date().toISOString();
        // The creator is automatically added as admin and owner.
        // creatorUserId should be the authenticated user's ID; falls back to
        // a placeholder UUID when called without auth context.
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
          userId: memberId, // placeholder until user accepts invite
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

      setActiveTeam: (teamId) => set({ activeTeamId: teamId }),

      getActiveTeam: () => {
        const { teams, activeTeamId } = get();
        if (!activeTeamId) return null;
        return teams.find((t) => t.id === activeTeamId) ?? null;
      },

      getMemberRole: (teamId, userId) => {
        const team = get().teams.find((t) => t.id === teamId);
        if (!team) return null;
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
