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
  // AUDIT-FIX CMP-13: `webSearchEnabled` (default true) used to live here as
  // well as on `chatStore` (default false). Two persisted booleans with the
  // same name and opposite defaults in one package; only the chatStore one was
  // ever read (useChat sends the chatStore's automatic intent), so this one was a
  // permanently-wrong second answer to "is web search on?". Deleted -- read
  // `useChatStore.getState().webSearchEnabled`.
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
  // AUDIT-FIX settings-21: `toolAccessMode: 'lazy' | 'eager'` and
  // `setToolAccessMode` used to live here, persisted and even exported in the
  // GDPR data snapshot, but had zero readers and zero writers anywhere in the
  // repo — no UI control rendered it, and nothing branched tool-loading
  // behavior on it. A settings control that only writes this field back to
  // itself (no request contract, network body, or server handler consumes
  // it) would be a decorative toggle, the exact anti-pattern
  // PrivacySection.tsx's deleted training toggle also was. Deleted rather
  // than half-wired; reintroduce only alongside the real send-time behavior
  // it would need to gate.
  autoApproveMode: 'ask' | 'smart' | 'full';
  notifyCompletions: boolean;
  notifyAgentUpdates: boolean;
  notifyResearch: boolean;
  hapticsEnabled: boolean;

  updateProfile: (updates: Partial<UserProfile>) => void;
  setLanguage: (lang: string) => void;
  toggleArtifacts: () => void;
  toggleInlineViz: () => void;
  toggleCodeExecution: () => void;
  setCodeExecutionDeploymentEnabled: (enabled: boolean) => void;
  setGenericWebSearchDeploymentEnabled: (enabled: boolean) => void;
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
      autoApproveMode: 'ask' as const,
      notifyCompletions: true,
      notifyAgentUpdates: true,
      notifyResearch: true,
      hapticsEnabled: true,

      updateProfile: (updates) => set((state) => ({ profile: { ...state.profile, ...updates } })),

      setLanguage: (lang) => set({ language: lang }),
      toggleArtifacts: () => set((s) => ({ artifactsEnabled: !s.artifactsEnabled })),
      toggleInlineViz: () =>
        set((s) => ({ inlineVisualizationsEnabled: !s.inlineVisualizationsEnabled })),
      toggleCodeExecution: () => set((s) => ({ codeExecutionEnabled: !s.codeExecutionEnabled })),
      setCodeExecutionDeploymentEnabled: (enabled) =>
        set({ codeExecutionDeploymentEnabled: enabled }),
      setGenericWebSearchDeploymentEnabled: (enabled) =>
        set({ genericWebSearchDeploymentEnabled: enabled }),
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
