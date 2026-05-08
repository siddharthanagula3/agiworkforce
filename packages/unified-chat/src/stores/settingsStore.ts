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
  webSearchEnabled: boolean;
  artifactsEnabled: boolean;
  inlineVisualizationsEnabled: boolean;
  codeExecutionEnabled: boolean;
  memorySearchChats: boolean;
  memoryGenerateFromHistory: boolean;
  toolAccessMode: 'lazy' | 'eager';
  autoApproveMode: 'ask' | 'smart' | 'full';
  notifyCompletions: boolean;
  notifyAgentUpdates: boolean;
  notifyResearch: boolean;
  hapticsEnabled: boolean;

  updateProfile: (updates: Partial<UserProfile>) => void;
  setLanguage: (lang: string) => void;
  toggleWebSearch: () => void;
  toggleArtifacts: () => void;
  toggleInlineViz: () => void;
  toggleCodeExecution: () => void;
  setToolAccessMode: (mode: 'lazy' | 'eager') => void;
  setAutoApproveMode: (mode: 'ask' | 'smart' | 'full') => void;
  toggleNotifyCompletions: () => void;
  toggleNotifyAgentUpdates: () => void;
  toggleNotifyResearch: () => void;
  toggleMemorySearchChats: () => void;
  toggleMemoryGenerateFromHistory: () => void;
}

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
      webSearchEnabled: true,
      artifactsEnabled: true,
      inlineVisualizationsEnabled: true,
      codeExecutionEnabled: true,
      memorySearchChats: true,
      memoryGenerateFromHistory: true,
      toolAccessMode: 'lazy' as const,
      autoApproveMode: 'ask' as const,
      notifyCompletions: true,
      notifyAgentUpdates: true,
      notifyResearch: true,
      hapticsEnabled: true,

      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

      setLanguage: (lang) => set({ language: lang }),
      toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
      toggleArtifacts: () => set((s) => ({ artifactsEnabled: !s.artifactsEnabled })),
      toggleInlineViz: () =>
        set((s) => ({ inlineVisualizationsEnabled: !s.inlineVisualizationsEnabled })),
      toggleCodeExecution: () => set((s) => ({ codeExecutionEnabled: !s.codeExecutionEnabled })),
      setToolAccessMode: (mode) => set({ toolAccessMode: mode }),
      setAutoApproveMode: (mode) => set({ autoApproveMode: mode }),
      toggleNotifyCompletions: () => set((s) => ({ notifyCompletions: !s.notifyCompletions })),
      toggleNotifyAgentUpdates: () => set((s) => ({ notifyAgentUpdates: !s.notifyAgentUpdates })),
      toggleNotifyResearch: () => set((s) => ({ notifyResearch: !s.notifyResearch })),
      toggleMemorySearchChats: () => set((s) => ({ memorySearchChats: !s.memorySearchChats })),
      toggleMemoryGenerateFromHistory: () =>
        set((s) => ({ memoryGenerateFromHistory: !s.memoryGenerateFromHistory })),
    }),
    {
      name: 'chat-settings-store',
    },
  ),
);
