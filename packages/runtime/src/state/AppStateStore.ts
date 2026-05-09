/**
 * AppStateStore — canonical application state shape.
 *
 * Design principles (from Anthropic reference, misc1-skills-tasks-state-memdir.md §8.3):
 *  - 75-field AppState in reference; we use a smaller domain-coherent shape
 *    (auth, chat, settings, subscriptions, mcp, memory) rather than 102 per-feature stores.
 *  - DeepReadonly on top-level to prevent accidental mutation.
 *  - Model IDs are NEVER hardcoded here. activeModelId is set at runtime from
 *    models.json via the modelStore/settings; the store holds a string | null ref.
 *
 * Domains (6 domain-coherent stores, consolidated from 102 per-feature stores):
 *   auth         — user identity, tokens, plan tier (combines authStore, accountStore)
 *   chat         — active conversation, streaming state, active model ref
 *   settings     — theme, language, preferences (combines settingsStore, chatPreferencesStore)
 *   subscriptions — plan tier, billing state (combines billingUsage, appModeStore tier)
 *   mcp          — MCP server connection count, health (combines mcpStore, mcpServerStore)
 *   memory       — memory entries, decay config (memoryStore)
 *
 * Persistence migration sketch (Task 1.3 acceptance criteria: "sketch the abstraction"):
 *   - Desktop: store serialises `settings` + `auth.planTier` + `subscriptions.planTier`
 *     to `~/.agiworkforce/state.json` via a registered persistenceHandler.
 *   - Web: same fields to localStorage.
 *   - Mobile: MMKV via a registered persistenceHandler in the mobile workspace.
 *   - CLI: `~/.agiworkforce/settings.json` (same format, different path).
 *   Full implementation deferred to follow-on task; the registerPersistenceHandler hook
 *   in onChangeAppState.ts is the wiring point.
 */

// ---------------------------------------------------------------------------
// Auth domain
// ---------------------------------------------------------------------------

export interface AuthState {
  /** Supabase user ID, null if not authenticated. */
  userId: string | null;
  /** Email, null if not authenticated. */
  email: string | null;
  /** Display name, null if not set. */
  displayName: string | null;
  /** Avatar URL, null if not set. */
  avatarUrl: string | null;
  /** Plan tier — one of the 6 canonical tiers. */
  planTier: PlanTier;
  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;
  /** JWT access token, null if not authenticated. */
  accessToken: string | null;
  /** Epoch ms of last successful auth sync. */
  lastSyncedAt: number | null;
}

/**
 * Six canonical tiers (locked per CLAUDE.md).
 * `free` is retained as an alias for backward-compat with featureGates.ts.
 */
export type PlanTier = 'local-only' | 'byok' | 'hobby' | 'pro' | 'max' | 'enterprise' | 'free'; // legacy alias

// ---------------------------------------------------------------------------
// Chat domain
// ---------------------------------------------------------------------------

export interface ChatState {
  /**
   * Active model ID — set from models.json at runtime, NEVER hardcoded.
   * null means "not yet resolved" (models.json not yet loaded).
   */
  activeModelId: string | null;
  /**
   * Active provider — set from models.json provider key at runtime.
   */
  activeProvider: string | null;
  /** Currently focused conversation ID. */
  activeConversationId: string | null;
  /** Whether a streaming response is in flight. */
  isStreaming: boolean;
  /** Whether the app mode is local or cloud. */
  appMode: 'local' | 'cloud';
}

// ---------------------------------------------------------------------------
// Settings domain
// ---------------------------------------------------------------------------

export interface SettingsState {
  /** UI theme identifier. */
  theme: string;
  /** Locale/language code. */
  language: string;
  /** Chat font family preference. */
  chatFont: string;
  /** Whether to show thinking blocks. */
  showThinking: boolean;
  /** Whether agent mode is always enabled. */
  alwaysUseAgentMode: boolean;
  /** Custom system prompt override (null = use default). */
  systemPromptOverride: string | null;
}

// ---------------------------------------------------------------------------
// Subscriptions domain
// ---------------------------------------------------------------------------

export interface SubscriptionsState {
  /** Current plan tier (mirrors auth.planTier for cross-domain reads). */
  planTier: PlanTier;
  /** Stripe subscription status. */
  subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled' | 'trialing';
  /** Remaining credit balance in cents, null if not on metered plan. */
  remainingCreditCents: number | null;
  /** Daily credit limit in cents, null if not metered. */
  dailyCreditLimitCents: number | null;
  /** Epoch ms when the current billing period ends. */
  periodEndMs: number | null;
}

// ---------------------------------------------------------------------------
// MCP domain
// ---------------------------------------------------------------------------

export interface McpState {
  /** Number of currently connected MCP servers. */
  connectedCount: number;
  /** Whether MCP initialization has completed. */
  isInitialized: boolean;
  /** IDs of servers currently in error state. */
  errorServerIds: string[];
}

// ---------------------------------------------------------------------------
// Memory domain
// ---------------------------------------------------------------------------

export interface MemoryState {
  /** Total number of memory entries. */
  totalEntries: number;
  /** Average importance score (0–1). */
  avgImportance: number;
  /** Whether memory decay is enabled. */
  decayEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Canonical AppState
// ---------------------------------------------------------------------------

export interface AppState {
  auth: AuthState;
  chat: ChatState;
  settings: SettingsState;
  subscriptions: SubscriptionsState;
  mcp: McpState;
  memory: MemoryState;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

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
  // NEVER hardcode a model ID here. Resolved from models.json at runtime.
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
