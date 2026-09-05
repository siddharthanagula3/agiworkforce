import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { BillingPlanTier } from '@agiworkforce/types';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  plan: BillingPlanTier;
  role: 'user' | 'admin' | 'moderator';
  permissions: string[];
  profile: {
    firstName: string;
    lastName: string;
    company?: string;
    bio?: string;
    timezone: string;
    preferences: {
      emailNotifications: boolean;
      pushNotifications: boolean;
      marketingEmails: boolean;
    };
  };
  billing: {
    customerId?: string;
    subscriptionId?: string;
    subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing';
    trialEndsAt?: Date;
    currentPeriodEnd?: Date;
  };
  usage: {
    tokensUsed: number;
    tokensLimit: number;
    jobsCompleted: number;
    employeesPurchased: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
}

export interface UserProfileActions {
  setUser: (user: UserProfile | null) => void;
  updateProfile: (updates: Partial<UserProfile['profile']>) => void;
  updateUser: (updates: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

export interface UserProfileStore extends UserProfileState, UserProfileActions {}

const INITIAL_STATE: UserProfileState = {
  user: null,
  isLoading: false,
  error: null,
};

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useUserProfileStore = create<UserProfileStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...INITIAL_STATE,

        setUser: (user: UserProfile | null) =>
          set((state) => {
            state.user = user;
          }),

        updateProfile: (updates: Partial<UserProfile['profile']>) =>
          set((state) => {
            if (state.user) {
              state.user.profile = { ...state.user.profile, ...updates };
              state.user.updatedAt = new Date();
            }
          }),

        updateUser: (updates: Partial<UserProfile>) =>
          set((state) => {
            if (state.user) {
              state.user = { ...state.user, ...updates, updatedAt: new Date() };
            }
          }),

        setLoading: (loading: boolean) =>
          set((state) => {
            state.isLoading = loading;
          }),

        setError: (error: string | null) =>
          set((state) => {
            state.error = error;
          }),

        clearError: () =>
          set((state) => {
            state.error = null;
          }),

        reset: () =>
          set((state) => {
            Object.assign(state, INITIAL_STATE);
          }),
      })),
      {
        name: 'agi-user-profile-store',
        version: 1,
        migrate: (persisted) => persisted,
        partialize: (state) => ({
          user: state.user,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<UserProfileState>;
          if (persisted.user) {
            persisted.user.createdAt = new Date(persisted.user.createdAt);
            persisted.user.updatedAt = new Date(persisted.user.updatedAt);
            if (persisted.user.billing?.trialEndsAt) {
              persisted.user.billing.trialEndsAt = new Date(persisted.user.billing.trialEndsAt);
            }
            if (persisted.user.billing?.currentPeriodEnd) {
              persisted.user.billing.currentPeriodEnd = new Date(
                persisted.user.billing.currentPeriodEnd,
              );
            }
          }
          return { ...currentState, ...persisted };
        },
      },
    ),
    {
      name: 'User Profile Store',
      enabled: enableDevtools,
    },
  ),
);

export const useUser = (): UserProfile | null => useUserProfileStore((state) => state.user);

export const useUserPlan = (): UserProfile['plan'] | undefined =>
  useUserProfileStore((state) => state.user?.plan);

export const useUserUsage = (): UserProfile['usage'] | undefined =>
  useUserProfileStore((state) => state.user?.usage);

export const useUserBilling = (): UserProfile['billing'] | undefined =>
  useUserProfileStore((state) => state.user?.billing);

export const useUserProfileDetails = (): UserProfile['profile'] | undefined =>
  useUserProfileStore((state) => state.user?.profile);

export const useUserProfileLoading = (): boolean => useUserProfileStore((state) => state.isLoading);

export const useUserProfileError = (): string | null => useUserProfileStore((state) => state.error);

/** @deprecated Use useUserProfileDetails instead */
export const useUserProfile = useUserProfileDetails;
