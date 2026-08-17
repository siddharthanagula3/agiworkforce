import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserProfile {
  fullName: string;
  nickname: string;
  workType: string;
  personalPreferences: string;
  email: string;
  avatarUrl?: string;
  plan: string;
}

interface SettingsState {
  profile: UserProfile;
  language: string;
  artifactsEnabled: boolean;
  codeExecutionEnabled: boolean;
  codeExecutionDeploymentEnabled: boolean;
  genericWebSearchDeploymentEnabled: boolean;
  autoApproveMode: 'ask' | 'smart' | 'full';
  hapticsEnabled: boolean;

  updateProfile: (updates: Partial<UserProfile>) => void;
  setLanguage: (lang: string) => void;
  toggleArtifacts: () => void;
  toggleCodeExecution: () => void;
  setCodeExecutionDeploymentEnabled: (enabled: boolean) => void;
  setGenericWebSearchDeploymentEnabled: (enabled: boolean) => void;
  setAutoApproveMode: (mode: 'ask' | 'smart' | 'full') => void;
}

export const REMOVED_PERSISTED_SETTINGS_KEYS = [
  'inlineVisualizationsEnabled',
  'memorySearchChats',
  'memoryGenerateFromHistory',
  'notifyCompletions',
  'notifyAgentUpdates',
  'notifyResearch',
  'toolAccessMode',
] as const;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      profile: {
        fullName: '',
        nickname: '',
        workType: '',
        personalPreferences: '',
        email: '',
        plan: 'free',
      },
      language: 'en-US',
      artifactsEnabled: true,
      codeExecutionEnabled: false,
      codeExecutionDeploymentEnabled: false,
      genericWebSearchDeploymentEnabled: false,
      autoApproveMode: 'ask' as const,
      hapticsEnabled: true,

      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

      setLanguage: (lang) => set({ language: lang }),
      toggleArtifacts: () => set((s) => ({ artifactsEnabled: !s.artifactsEnabled })),
      toggleCodeExecution: () => set((s) => ({ codeExecutionEnabled: !s.codeExecutionEnabled })),
      setCodeExecutionDeploymentEnabled: (enabled) =>
        set({ codeExecutionDeploymentEnabled: enabled }),
      setGenericWebSearchDeploymentEnabled: (enabled) =>
        set({ genericWebSearchDeploymentEnabled: enabled }),
      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
    }),
    {
      name: 'chat-settings-store',
      version: 1,
      // Deleting a field from the type does not delete it from a returning
      // user's persisted blob; zustand's default merge would fold the stale
      // keys straight back onto live state and back into any settings export.
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') return persisted as SettingsState;
        const next = { ...(persisted as Record<string, unknown>) };
        for (const key of REMOVED_PERSISTED_SETTINGS_KEYS) delete next[key];
        return next as unknown as SettingsState;
      },
    },
  ),
);
