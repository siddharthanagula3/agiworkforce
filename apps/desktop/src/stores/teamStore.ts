import { create } from 'zustand';
import {
  createTeam as apiCreateTeam,
  getTeam as apiGetTeam,
  updateTeam as apiUpdateTeam,
  updateTeamSettings as apiUpdateTeamSettings,
  deleteTeam as apiDeleteTeam,
  getUserTeams as apiGetUserTeams,
  inviteMember as apiInviteMember,
  acceptInvitation as apiAcceptInvitation,
  removeMember as apiRemoveMember,
  updateMemberRole as apiUpdateMemberRole,
  getTeamMembers as apiGetTeamMembers,
  getTeamInvitations as apiGetTeamInvitations,
  shareResource as apiShareResource,
  unshareResource as apiUnshareResource,
  getTeamResources as apiGetTeamResources,
  getTeamResourcesByType as apiGetTeamResourcesByType,
  getTeamActivity as apiGetTeamActivity,
  getUserTeamActivity as apiGetUserTeamActivity,
  getTeamBilling as apiGetTeamBilling,
  initializeTeamBilling as apiInitializeTeamBilling,
  updateTeamPlan as apiUpdateTeamPlan,
  addTeamSeats as apiAddTeamSeats,
  removeTeamSeats as apiRemoveTeamSeats,
  calculateTeamCost as apiCalculateTeamCost,
  updateTeamUsage as apiUpdateTeamUsage,
  transferTeamOwnership as apiTransferTeamOwnership,
} from '../api/teamsApi';
import type { UpdateTeamSettingsParams } from '../api/teamsApi';
import type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamResource,
  TeamActivity,
  TeamBilling,
  UsageMetrics,
} from '../types/teams';

interface TeamState {
  currentTeam: Team | null;
  teams: Team[];
  members: TeamMember[];
  invitations: TeamInvitation[];
  resources: TeamResource[];
  activities: TeamActivity[];
  billing: TeamBilling | null;

  isLoading: boolean;
  isLoadingMembers: boolean;
  isLoadingResources: boolean;
  isLoadingActivities: boolean;
  isLoadingBilling: boolean;

  error: string | null;

  createTeam: (name: string, description: string | null, ownerId: string) => Promise<Team>;
  getTeam: (teamId: string) => Promise<Team | null>;
  updateTeam: (teamId: string, name: string | null, description: string | null) => Promise<void>;
  updateTeamSettings: (params: UpdateTeamSettingsParams) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  getUserTeams: (userId: string) => Promise<Team[]>;
  setCurrentTeam: (team: Team | null) => void;

  inviteMember: (teamId: string, email: string, role: string, invitedBy: string) => Promise<string>;
  acceptInvitation: (token: string, userId: string) => Promise<Team>;
  removeMember: (teamId: string, userId: string, removedBy: string) => Promise<void>;
  updateMemberRole: (
    teamId: string,
    userId: string,
    role: string,
    updatedBy: string,
  ) => Promise<void>;
  getTeamMembers: (teamId: string) => Promise<TeamMember[]>;
  getTeamInvitations: (teamId: string) => Promise<TeamInvitation[]>;

  shareResource: (
    teamId: string,
    resourceType: string,
    resourceId: string,
    resourceName: string,
    resourceDescription: string | null,
    sharedBy: string,
  ) => Promise<void>;
  unshareResource: (
    teamId: string,
    resourceType: string,
    resourceId: string,
    unsharedBy: string,
  ) => Promise<void>;
  getTeamResources: (teamId: string) => Promise<TeamResource[]>;
  getTeamResourcesByType: (teamId: string, resourceType: string) => Promise<TeamResource[]>;

  getTeamActivity: (teamId: string, limit: number, offset: number) => Promise<TeamActivity[]>;
  getUserTeamActivity: (teamId: string, userId: string, limit: number) => Promise<TeamActivity[]>;

  getTeamBilling: (teamId: string) => Promise<TeamBilling | null>;
  initializeTeamBilling: (
    teamId: string,
    plan: string,
    cycle: string,
    seatCount: number,
  ) => Promise<TeamBilling>;
  updateTeamPlan: (teamId: string, plan: string, updatedBy: string) => Promise<void>;
  addTeamSeats: (teamId: string, count: number, updatedBy: string) => Promise<void>;
  removeTeamSeats: (teamId: string, count: number, updatedBy: string) => Promise<void>;
  calculateTeamCost: (teamId: string) => Promise<number>;
  updateTeamUsage: (teamId: string, metrics: UsageMetrics) => Promise<void>;
  transferTeamOwnership: (
    teamId: string,
    newOwnerId: string,
    transferredBy: string,
  ) => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

const initialState = {
  currentTeam: null,
  teams: [],
  members: [],
  invitations: [],
  resources: [],
  activities: [],
  billing: null,
  isLoading: false,
  isLoadingMembers: false,
  isLoadingResources: false,
  isLoadingActivities: false,
  isLoadingBilling: false,
  error: null,
};

export const useTeamStore = create<TeamState>((set, get) => ({
  ...initialState,

  // --------------------------------------------------------------------------
  // Team CRUD
  // --------------------------------------------------------------------------

  createTeam: async (name, description, ownerId) => {
    set({ isLoading: true, error: null });
    try {
      const team = await apiCreateTeam(name, description, ownerId);
      set((state) => ({ teams: [...state.teams, team], isLoading: false }));
      return team;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  getTeam: async (teamId) => {
    set({ isLoading: true, error: null });
    try {
      const team = await apiGetTeam(teamId);
      set({ isLoading: false });
      return team;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateTeam: async (teamId, name, description) => {
    set({ isLoading: true, error: null });
    try {
      await apiUpdateTeam(teamId, name, description);
      const team = await apiGetTeam(teamId);
      if (team) {
        set((state) => ({
          teams: state.teams.map((t) => (t.id === teamId ? team : t)),
          currentTeam: state.currentTeam?.id === teamId ? team : state.currentTeam,
          isLoading: false,
        }));
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  updateTeamSettings: async (params) => {
    set({ isLoading: true, error: null });
    try {
      await apiUpdateTeamSettings(params);
      const team = await apiGetTeam(params.teamId);
      if (team) {
        set((state) => ({
          teams: state.teams.map((t) => (t.id === params.teamId ? team : t)),
          currentTeam: state.currentTeam?.id === params.teamId ? team : state.currentTeam,
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  deleteTeam: async (teamId) => {
    set({ isLoading: true, error: null });
    try {
      await apiDeleteTeam(teamId);
      set((state) => ({
        teams: state.teams.filter((t) => t.id !== teamId),
        currentTeam: state.currentTeam?.id === teamId ? null : state.currentTeam,
        isLoading: false,
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  getUserTeams: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const teams = await apiGetUserTeams(userId);
      set({ teams, isLoading: false });
      return teams;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  setCurrentTeam: (team) => {
    set({ currentTeam: team });
  },

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------

  inviteMember: async (teamId, email, role, invitedBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      const token = await apiInviteMember(teamId, email, role, invitedBy);
      await get().getTeamInvitations(teamId);
      set({ isLoadingMembers: false });
      return token;
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  acceptInvitation: async (token, userId) => {
    set({ isLoading: true, error: null });
    try {
      const team = await apiAcceptInvitation(token, userId);
      set((state) => ({
        teams: [...state.teams, team],
        isLoading: false,
      }));
      return team;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  removeMember: async (teamId, userId, removedBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      await apiRemoveMember(teamId, userId, removedBy);
      await get().getTeamMembers(teamId);
      set({ isLoadingMembers: false });
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  updateMemberRole: async (teamId, userId, role, updatedBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      await apiUpdateMemberRole(teamId, userId, role, updatedBy);
      await get().getTeamMembers(teamId);
      set({ isLoadingMembers: false });
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  getTeamMembers: async (teamId) => {
    set({ isLoadingMembers: true, error: null });
    try {
      const members = await apiGetTeamMembers(teamId);
      set({ members, isLoadingMembers: false });
      return members;
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  getTeamInvitations: async (teamId) => {
    set({ isLoadingMembers: true, error: null });
    try {
      const invitations = await apiGetTeamInvitations(teamId);
      set({ invitations, isLoadingMembers: false });
      return invitations;
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  // --------------------------------------------------------------------------
  // Resources
  // --------------------------------------------------------------------------

  shareResource: async (
    teamId,
    resourceType,
    resourceId,
    resourceName,
    resourceDescription,
    sharedBy,
  ) => {
    set({ isLoadingResources: true, error: null });
    try {
      await apiShareResource(
        teamId,
        resourceType,
        resourceId,
        resourceName,
        resourceDescription,
        sharedBy,
      );
      await get().getTeamResources(teamId);
      set({ isLoadingResources: false });
    } catch (error) {
      set({ error: String(error), isLoadingResources: false });
      throw error;
    }
  },

  unshareResource: async (teamId, resourceType, resourceId, unsharedBy) => {
    set({ isLoadingResources: true, error: null });
    try {
      await apiUnshareResource(teamId, resourceType, resourceId, unsharedBy);
      await get().getTeamResources(teamId);
      set({ isLoadingResources: false });
    } catch (error) {
      set({ error: String(error), isLoadingResources: false });
      throw error;
    }
  },

  getTeamResources: async (teamId) => {
    set({ isLoadingResources: true, error: null });
    try {
      const resources = await apiGetTeamResources(teamId);
      set({ resources, isLoadingResources: false });
      return resources;
    } catch (error) {
      set({ error: String(error), isLoadingResources: false });
      throw error;
    }
  },

  getTeamResourcesByType: async (teamId, resourceType) => {
    set({ isLoadingResources: true, error: null });
    try {
      const resources = await apiGetTeamResourcesByType(teamId, resourceType);
      set({ isLoadingResources: false });
      return resources;
    } catch (error) {
      set({ error: String(error), isLoadingResources: false });
      throw error;
    }
  },

  // --------------------------------------------------------------------------
  // Activity
  // --------------------------------------------------------------------------

  getTeamActivity: async (teamId, limit, offset) => {
    set({ isLoadingActivities: true, error: null });
    try {
      const activities = await apiGetTeamActivity(teamId, limit, offset);
      set({ activities, isLoadingActivities: false });
      return activities;
    } catch (error) {
      set({ error: String(error), isLoadingActivities: false });
      throw error;
    }
  },

  getUserTeamActivity: async (teamId, userId, limit) => {
    set({ isLoadingActivities: true, error: null });
    try {
      const activities = await apiGetUserTeamActivity(teamId, userId, limit);
      set({ isLoadingActivities: false });
      return activities;
    } catch (error) {
      set({ error: String(error), isLoadingActivities: false });
      throw error;
    }
  },

  // --------------------------------------------------------------------------
  // Billing
  // --------------------------------------------------------------------------

  getTeamBilling: async (teamId) => {
    set({ isLoadingBilling: true, error: null });
    try {
      const billing = await apiGetTeamBilling(teamId);
      set({ billing, isLoadingBilling: false });
      return billing;
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  initializeTeamBilling: async (teamId, plan, cycle, seatCount) => {
    set({ isLoadingBilling: true, error: null });
    try {
      const billing = await apiInitializeTeamBilling(teamId, plan, cycle, seatCount);
      set({ billing, isLoadingBilling: false });
      return billing;
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  updateTeamPlan: async (teamId, plan, updatedBy) => {
    set({ isLoadingBilling: true, error: null });
    try {
      await apiUpdateTeamPlan(teamId, plan, updatedBy);
      await get().getTeamBilling(teamId);
      set({ isLoadingBilling: false });
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  addTeamSeats: async (teamId, count, updatedBy) => {
    set({ isLoadingBilling: true, error: null });
    try {
      await apiAddTeamSeats(teamId, count, updatedBy);
      await get().getTeamBilling(teamId);
      set({ isLoadingBilling: false });
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  removeTeamSeats: async (teamId, count, updatedBy) => {
    set({ isLoadingBilling: true, error: null });
    try {
      await apiRemoveTeamSeats(teamId, count, updatedBy);
      await get().getTeamBilling(teamId);
      set({ isLoadingBilling: false });
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  calculateTeamCost: async (teamId) => {
    try {
      const cost = await apiCalculateTeamCost(teamId);
      return cost;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateTeamUsage: async (teamId, metrics) => {
    try {
      await apiUpdateTeamUsage(teamId, metrics);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // --------------------------------------------------------------------------
  // Ownership
  // --------------------------------------------------------------------------

  transferTeamOwnership: async (teamId, newOwnerId, transferredBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      await apiTransferTeamOwnership(teamId, newOwnerId, transferredBy);
      await get().getTeamMembers(teamId);
      const team = await apiGetTeam(teamId);
      if (team) {
        set((state) => ({
          teams: state.teams.map((t) => (t.id === teamId ? team : t)),
          currentTeam: state.currentTeam?.id === teamId ? team : state.currentTeam,
        }));
      }
      set({ isLoadingMembers: false });
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
