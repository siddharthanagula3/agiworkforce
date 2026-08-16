

export interface AuthState {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  planTier: PlanTier;
  isAuthenticated: boolean;
  accessToken: string | null;
  lastSyncedAt: number | null;
}

export type PlanTier = 'local-only' | 'byok' | 'hobby' | 'pro' | 'max' | 'enterprise' | 'free';

export interface ChatState {
  activeModelId: string | null;
  activeProvider: string | null;
  activeConversationId: string | null;
  isStreaming: boolean;
  appMode: 'local' | 'cloud';
}

export interface SettingsState {
  theme: string;
  language: string;
  chatFont: string;
  showThinking: boolean;
  alwaysUseAgentMode: boolean;
  systemPromptOverride: string | null;
}

export interface SubscriptionsState {
  planTier: PlanTier;
  subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled' | 'trialing';
  remainingCreditCents: number | null;
  dailyCreditLimitCents: number | null;
  periodEndMs: number | null;
}

export interface McpState {
  connectedCount: number;
  isInitialized: boolean;
  errorServerIds: string[];
}

export interface MemoryState {
  totalEntries: number;
  avgImportance: number;
  decayEnabled: boolean;
}

export interface AppState {
  auth: AuthState;
  chat: ChatState;
  settings: SettingsState;
  subscriptions: SubscriptionsState;
  mcp: McpState;
  memory: MemoryState;
}

export const initialAuthState: AuthState = {
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  planTier: 'free',
  isAuthenticated: false,
  accessToken: null,
  lastSyncedAt: null,
};

export const initialChatState: ChatState = {
  activeModelId: null,
  activeProvider: null,
  activeConversationId: null,
  isStreaming: false,
  appMode: 'local',
};

export const initialSettingsState: SettingsState = {
  theme: 'system',
  language: 'en',
  chatFont: 'default',
  showThinking: true,
  alwaysUseAgentMode: false,
  systemPromptOverride: null,
};

export const initialSubscriptionsState: SubscriptionsState = {
  planTier: 'free',
  subscriptionStatus: 'none',
  remainingCreditCents: null,
  dailyCreditLimitCents: null,
  periodEndMs: null,
};

export const initialMcpState: McpState = {
  connectedCount: 0,
  isInitialized: false,
  errorServerIds: [],
};

export const initialMemoryState: MemoryState = {
  totalEntries: 0,
  avgImportance: 0,
  decayEnabled: false,
};

export const initialAppState: AppState = {
  auth: initialAuthState,
  chat: initialChatState,
  settings: initialSettingsState,
  subscriptions: initialSubscriptionsState,
  mcp: initialMcpState,
  memory: initialMemoryState,
};
