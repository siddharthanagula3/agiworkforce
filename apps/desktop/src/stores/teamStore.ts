import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  Team,
  TeamMember,
  TeamInvitation,
  TeamResource,
  TeamActivity,
  TeamBilling,
  UsageMetrics,
} from '../types/teams';

interface TeamState {
  // Current team context
  currentTeam: Team | null;
  teams: Team[];
  members: TeamMember[];
  invitations: TeamInvitation[];
  resources: TeamResource[];
  activities: TeamActivity[];
  billing: TeamBilling | null;

  // Loading states
  isLoading: boolean;
  isLoadingMembers: boolean;
  isLoadingResources: boolean;
  isLoadingActivities: boolean;
  isLoadingBilling: boolean;

  // Error state
  error: string | null;

  // Team actions
  createTeam: (name: string, description: string | null, ownerId: string) => Promise<Team>;
  getTeam: (teamId: string) => Promise<Team | null>;
  updateTeam: (teamId: string, name: string | null, description: string | null) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  getUserTeams: (userId: string) => Promise<Team[]>;
  setCurrentTeam: (team: Team | null) => void;

  // Member actions
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

  // Resource actions
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

  // Activity actions
  getTeamActivity: (teamId: string, limit: number, offset: number) => Promise<TeamActivity[]>;
  getUserTeamActivity: (teamId: string, userId: string, limit: number) => Promise<TeamActivity[]>;

  // Billing actions
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

  // Utility actions
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

  // Team actions
  createTeam: async (name, description, ownerId) => {
    set({ isLoading: true, error: null });
    try {
      const team = await invoke<Team>('create_team', { name, description, ownerId });
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
      const team = await invoke<Team | null>('get_team', { teamId });
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
      await invoke('update_team', { teamId, name, description });
      const team = await invoke<Team | null>('get_team', { teamId });
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

  deleteTeam: async (teamId) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('delete_team', { teamId });
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
      const teams = await invoke<Team[]>('get_user_teams', { userId });
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

  // Member actions
  inviteMember: async (teamId, email, role, invitedBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      const token = await invoke<string>('invite_member', { teamId, email, role, invitedBy });
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
      const team = await invoke<Team>('accept_invitation', { token, userId });
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
      await invoke('remove_member', { teamId, userId, removedBy });
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
      await invoke('update_member_role', { teamId, userId, role, updatedBy });
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
      const members = await invoke<TeamMember[]>('get_team_members', { teamId });
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
      const invitations = await invoke<TeamInvitation[]>('get_team_invitations', { teamId });
      set({ invitations, isLoadingMembers: false });
      return invitations;
    } catch (error) {
      set({ error: String(error), isLoadingMembers: false });
      throw error;
    }
  },

  // Resource actions
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
      await invoke('share_resource', {
        teamId,
        resourceType,
        resourceId,
        resourceName,
        resourceDescription,
        sharedBy,
      });
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
      await invoke('unshare_resource', { teamId, resourceType, resourceId, unsharedBy });
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
      const resources = await invoke<TeamResource[]>('get_team_resources', { teamId });
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
      const resources = await invoke<TeamResource[]>('get_team_resources_by_type', {
        teamId,
        resourceType,
      });
      set({ isLoadingResources: false });
      return resources;
    } catch (error) {
      set({ error: String(error), isLoadingResources: false });
      throw error;
    }
  },

  // Activity actions
  getTeamActivity: async (teamId, limit, offset) => {
    set({ isLoadingActivities: true, error: null });
    try {
      const activities = await invoke<TeamActivity[]>('get_team_activity', {
        teamId,
        limit,
        offset,
      });
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
      const activities = await invoke<TeamActivity[]>('get_user_team_activity', {
        teamId,
        userId,
        limit,
      });
      set({ isLoadingActivities: false });
      return activities;
    } catch (error) {
      set({ error: String(error), isLoadingActivities: false });
      throw error;
    }
  },

  // Billing actions
  getTeamBilling: async (teamId) => {
    set({ isLoadingBilling: true, error: null });
    try {
      const billing = await invoke<TeamBilling | null>('get_team_billing', { teamId });
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
      const billing = await invoke<TeamBilling>('initialize_team_billing', {
        teamId,
        plan,
        cycle,
        seatCount,
      });
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
      await invoke('update_team_plan', { teamId, plan, updatedBy });
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
      await invoke('add_team_seats', { teamId, count, updatedBy });
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
      await invoke('remove_team_seats', { teamId, count, updatedBy });
      await get().getTeamBilling(teamId);
      set({ isLoadingBilling: false });
    } catch (error) {
      set({ error: String(error), isLoadingBilling: false });
      throw error;
    }
  },

  calculateTeamCost: async (teamId) => {
    try {
      const cost = await invoke<number>('calculate_team_cost', { teamId });
      return cost;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateTeamUsage: async (teamId, metrics) => {
    try {
      await invoke('update_team_usage', { teamId, metrics });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  transferTeamOwnership: async (teamId, newOwnerId, transferredBy) => {
    set({ isLoadingMembers: true, error: null });
    try {
      await invoke('transfer_team_ownership', { teamId, newOwnerId, transferredBy });
      await get().getTeamMembers(teamId);
      const team = await invoke<Team | null>('get_team', { teamId });
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

  // Utility actions
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
