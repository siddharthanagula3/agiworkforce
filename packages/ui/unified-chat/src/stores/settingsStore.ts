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
  /** User's "Run code" composer preference. Off by default (web parity) — forwarded as a send-time request only when also currently available (see `codeExecutionDeploymentEnabled` + `isCodeExecutionAvailable`). */
  codeExecutionEnabled: boolean;
  /**
   * This deployment's E2B code-execution cut-over flag (`/api/me`
   * `feature_flags.code_execution`). NOT a user preference — hosts write
   * this via `setCodeExecutionDeploymentEnabled` whenever their account/
   * feature-flag fetch resolves, so the composer's "Run code" toggle and
   * `useChat`'s send-time gate agree on whether E2B-routed providers can
   * actually honor the request right now. Anthropic/Google/OpenAI's native
   * code-execution tool doesn't need this — see `isCodeExecutionAvailable`.
   */
  codeExecutionDeploymentEnabled: boolean;
  /** Cloud deployment capability for AGI's generic web-search function tool. */
  genericWebSearchDeploymentEnabled: boolean;
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
  setCodeExecutionDeploymentEnabled: (enabled: boolean) => void;
  setGenericWebSearchDeploymentEnabled: (enabled: boolean) => void;
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
      // Off by default — mirrors web's composer-level "Run code" toggle
      // (ChatComposerNew's `codeExecutionEnabled` useState defaults false).
      codeExecutionEnabled: false,
      // Deployment capability, not a persisted user choice — see the field
      // doc comment. Hosts overwrite this at runtime; the persisted default
      // is the safe "unavailable" state.
      codeExecutionDeploymentEnabled: false,
      genericWebSearchDeploymentEnabled: false,
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
      setCodeExecutionDeploymentEnabled: (enabled) =>
        set({ codeExecutionDeploymentEnabled: enabled }),
      setGenericWebSearchDeploymentEnabled: (enabled) =>
        set({ genericWebSearchDeploymentEnabled: enabled }),
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
