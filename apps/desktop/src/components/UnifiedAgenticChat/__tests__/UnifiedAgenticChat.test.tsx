/**
 * UnifiedAgenticChat Test Suite
 *
 * Fixed for React 19 + Zustand v5 compatibility.
 * The key fixes:
 * 1. Mock useUnifiedChatStore (not individual stores) since component uses the unified hook
 * 2. Mock all dependent stores that the component imports
 * 3. Use proper async patterns with act() and waitFor()
 * 4. Return stable mock function references to prevent infinite re-renders
 * 5. All mock state creation is inside vi.mock factories to avoid hoisting issues
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { NEW_CHAT_ABORT_EVENT } from '../../../lib/newChatReset';

// Mock monaco-editor before any imports
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
  languages: {
    register: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
  },
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Mock tauri-mock module
vi.mock('../../../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue({}),
  listen: vi.fn().mockResolvedValue(() => {}),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

// Mock the hooks that use Tauri
vi.mock('../../../hooks/useAgenticEvents', () => ({
  useAgenticEvents: vi.fn(),
}));

vi.mock('../../../hooks/useSlashCommands', () => ({
  useSlashCommands: vi.fn(() => ({
    parseSlashCommand: vi.fn(() => null),
    availableCommands: [],
  })),
}));

// Mock Terminal component
vi.mock('../../Terminal/TerminalWorkspace', () => ({
  TerminalWorkspace: () => null,
}));

// Mock ScrollArea
vi.mock('../../ui/ScrollArea', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => children,
  ScrollBar: () => null,
}));

// Mock child components that use complex stores/hooks
vi.mock('../AppLayout', () => ({
  AppLayout: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock('../ChatStream', () => ({
  ChatStream: () => <div data-testid="chat-stream" />,
}));

vi.mock('../ChatInputArea', () => ({
  ChatInputArea: ({ onSend: _onSend }: { onSend?: unknown }) => (
    <div data-testid="chat-input-area">
      <textarea placeholder="Ask me anything..." />
    </div>
  ),
}));

vi.mock('../BudgetAlertsPanel', () => ({
  BudgetAlertsPanel: () => null,
}));

vi.mock('../ProjectsView', () => ({
  ProjectsView: () => <div data-testid="projects-view" />,
}));

vi.mock('../ApprovalModal', () => ({
  ApprovalModal: () => null,
}));

// Mock supabaseAuth
vi.mock('../../../services/supabaseAuth', () => ({
  supabaseAuth: {
    getUser: vi.fn(() => ({ id: 'test-user-id', email: 'test@example.com' })),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    checkSession: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({
      user: { id: 'test-user-id', email: 'test@example.com' },
      session: { access_token: 'test-token' },
      isLoading: false,
    })),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

// Mock subscriptionGate
vi.mock('../../../utils/subscriptionGate', () => ({
  checkSubscriptionGate: vi.fn(() => ({ allowed: true })),
  getUpgradeMessage: vi.fn(() => 'Upgrade to pro'),
}));

// Mock hash utility
vi.mock('../../../lib/hash', () => ({
  sha256: vi.fn().mockResolvedValue('mock-hash'),
}));

// Mock taskMetadata utility
vi.mock('../../../lib/taskMetadata', () => ({
  deriveTaskMetadata: vi.fn(() => ({ category: 'chat', complexity: 'low' })),
}));

// Mock modelRouter utility
vi.mock('../../../lib/modelRouter', () => ({
  getModelForRequest: vi.fn(() => ({
    modelId: 'gpt-4o',
    wasRouted: false,
    reason: 'Manual selection',
  })),
}));

// Mock friendlyErrors utility
vi.mock('../../../lib/friendlyErrors', () => ({
  formatErrorForChat: vi.fn((error: string) => `Friendly: ${error}`),
}));

// Mock slash command handlers
vi.mock('../../../handlers/slashCommandHandlers', () => ({
  executeTerminalCommand: vi.fn(),
  executeBrowserCommand: vi.fn(),
  executeCodeCommand: vi.fn(),
  executeDatabaseCommand: vi.fn(),
  executeUndoCommand: vi.fn(),
}));

// Mock unifiedChatStore - the main store used by the component
// All state/functions must be defined inside the factory since vi.mock is hoisted
vi.mock('../../../stores/unifiedChatStore', () => {
  const mockState = {
    // Chat state
    conversations: [],
    activeConversationId: null,
    messagesByConversation: new Map(),
    messages: [],
    isLoading: false,
    isStreaming: false,
    currentStreamingMessageId: null,
    pendingMessages: [],
    citations: [],
    tokenUsage: { input: 0, output: 0, total: 0 },
    focusMode: 'chat' as const,
    activeView: 'chat' as const,
    conversationMode: 'chat' as const,
    draftContent: '',
    editingMessageId: null,
    showMessageTimestamps: false,
    selectedMessage: null,

    // Agent state
    agents: [],
    agentStatus: null,
    backgroundTasks: [],
    actionTrail: [],
    fadeTimers: new Map(),
    isAutonomousMode: false,
    missionControlOpen: false,

    // Tool state
    fileOperations: [],
    terminalCommands: [],
    toolExecutions: [],
    screenshots: [],
    actionLog: [],
    pendingApprovals: [],
    trustedWorkflows: new Map(),
    activeContext: [],
    workflowContext: null,
    plan: null,
    activeToolStreams: new Map(),
    filters: {},

    // Sidecar state
    sidecarOpen: false,
    sidecarSection: 'operations' as const,
    sidecarWidth: 400,
    sidecarUserSelected: false,
    sidebarWidth: 280,
    sidebarCollapsed: false,
    sidecar: { isOpen: false, activeMode: 'code' as const, contextId: null, autoTrigger: false },

    // Actions - stable mock functions
    setSidecarOpen: vi.fn(),
    openSidecar: vi.fn(),
    addMessage: vi.fn(() => 'mock-message-id'),
    updateMessage: vi.fn(),
    setIsLoading: vi.fn(),
    setStreamingMessage: vi.fn(),
    setWorkflowContext: vi.fn(),
    setDraftContent: vi.fn(),
    addActionTrailEntry: vi.fn(),
    setAgentStatus: vi.fn(),
    addPendingMessage: vi.fn(),
    removePendingMessage: vi.fn(),
    clearPendingMessages: vi.fn(),
    cancelEditing: vi.fn(),
    getConversationCustomInstructions: vi.fn(() => ''),
    addInlinePanel: vi.fn(),
    linkConversationId: vi.fn(),
    ensureActiveConversation: vi.fn().mockResolvedValue('test-conv-id'),
    loadConversations: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn(),
    selectConversation: vi.fn(),
    deleteConversation: vi.fn(),
    setState: vi.fn(),
    // Add getActiveActionTrail function
    getActiveActionTrail: vi.fn(() => []),
    clearActionTrail: vi.fn(),
    clearToolStreams: vi.fn(),
    removeActionTrailEntry: vi.fn(),
  };

  // Create a mock store with getState and setState
  const useUnifiedChatStore = vi.fn((selector?: (state: typeof mockState) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  });

  // Add static methods
  (useUnifiedChatStore as unknown as { getState: () => typeof mockState }).getState = () =>
    mockState;
  (useUnifiedChatStore as unknown as { setState: (partial: unknown) => void }).setState = vi.fn();

  return {
    useUnifiedChatStore,
    useChatStore: vi.fn(() => mockState),
    useAgentStore: vi.fn(() => mockState),
    useToolStore: vi.fn(() => mockState),
    useSidecarStore: vi.fn(() => mockState),
    uuidToDbId: vi.fn(() => 123),
    dbIdToUuid: vi.fn(() => 'test-uuid'),
  };
});

// Mock billingUsage store
vi.mock('../../../stores/billingUsage', () => {
  const state = {
    costOverview: { today_total: 0, month_total: 0, monthly_budget: null, remaining_budget: null },
    loadCostOverview: vi.fn().mockResolvedValue({}),
    budget: {
      enabled: false,
      period: 'daily',
      limit: 100000,
      warningThreshold: 80,
      currentUsage: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      periodStart: Date.now(),
      periodEnd: Date.now() + 86400000,
    },
    budgetAlerts: [], // Add empty budget alerts array
    dismissAlert: vi.fn(), // Add dismissAlert function
    addTokenUsage: vi.fn(),
    getTokenCost: vi.fn(() => 0),
  };

  return {
    useBillingUsageStore: vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    }),
    selectBudget: (s: { budget: unknown }) => s.budget,
  };
});

// Mock settings store
vi.mock('../../../stores/settingsStore', () => {
  const state = {
    llmConfig: {
      defaultProvider: 'managed_cloud',
      temperature: 0.7,
      maxTokens: 4096,
      defaultModels: {
        managed_cloud: 'gpt-4o',
        ollama: 'llama3',
      },
      taskRouting: {},
      favoriteModels: [],
    },
    chatPreferences: {
      promptCompletionEnabled: true,
      alwaysUseAgentMode: false,
    },
    loadSettings: vi.fn(),
  };

  return {
    useSettingsStore: vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    }),
  };
});

// Mock model store
vi.mock('../../../stores/modelStore', () => {
  const state = {
    selectedModel: 'gpt-4o',
    selectedProvider: 'managed_cloud',
    thinkingModeEnabled: false,
    availableModels: ['gpt-4o', 'claude-sonnet-4-5'],
  };

  return {
    useModelStore: vi.fn((selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    }),
  };
});

// Mock auth stores
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'test-token' },
    isLoading: false,
  })),
}));

// Create shared auth state for all auth-related stores
vi.mock('../../../stores/auth', () => {
  const mockAuthState = {
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'test-token' },
    isLoading: false,
    isAuthenticated: true,
    account: {
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
      avatar: null,
      plan: 'pro',
      planDisplayName: 'Pro',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
      currentPeriodEnd: null,
      stripeCustomerId: null,
      credits: { remaining_cents: 10000 },
    },
    plan: 'pro',
    planDisplayName: 'Pro',
    subscriptionStatus: 'active',
    subscriptionFetchStatus: 'succeeded',
    credits: { remaining_cents: 10000 },
    updateCredits: vi.fn(),
    fetchSubscription: vi.fn().mockResolvedValue({}),
    fetchCredits: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
  };

  const useUnifiedAuthStore = vi.fn((selector?: (s: typeof mockAuthState) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockAuthState);
    }
    return mockAuthState;
  });

  (useUnifiedAuthStore as unknown as { getState: () => typeof mockAuthState }).getState = () =>
    mockAuthState;

  return {
    useUnifiedAuthStore,
    useAuthStore: useUnifiedAuthStore,
    useAccountStore: useUnifiedAuthStore,
    useBillingStore: useUnifiedAuthStore,
    selectAccount: (state: typeof mockAuthState) => state.account,
    selectPlan: (state: typeof mockAuthState) => state.plan,
    selectPlanDisplayName: (state: typeof mockAuthState) => state.planDisplayName,
    selectSubscriptionFetchStatus: (state: typeof mockAuthState) => state.subscriptionFetchStatus,
    selectIsAuthenticated: (state: typeof mockAuthState) => state.isAuthenticated,
    selectIsPro: () => true,
    selectIsEnterprise: () => false,
    selectDisplayName: (state: typeof mockAuthState) => state.account?.displayName,
    selectEmail: (state: typeof mockAuthState) => state.account?.email,
    selectAvatar: (state: typeof mockAuthState) => state.account?.avatar,
    selectFeatureFlags: () => ({}),
    selectIsTierLoading: () => false,
    selectCredits: (state: typeof mockAuthState) => state.credits,
    selectStripeCustomer: () => null,
    selectStripeSubscription: () => null,
    initializeUnifiedAuthStore: vi.fn(),
    initializeAuthStore: vi.fn(),
    initializeAccountStore: vi.fn(),
    initializeBillingStore: vi.fn(),
    cleanupAccountStore: vi.fn(),
    cleanupUnifiedAuthStore: vi.fn(),
    waitForHydration: vi.fn().mockResolvedValue(undefined),
    hasFeature: vi.fn(() => false),
    getPlanDescription: vi.fn(() => 'Pro plan'),
  };
});

// Mock accountStore (re-exports from auth)
vi.mock('../../../stores/accountStore', () => {
  const mockAuthState = {
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'test-token' },
    isLoading: false,
    isAuthenticated: true,
    account: {
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
      avatar: null,
      plan: 'pro',
      planDisplayName: 'Pro',
      subscriptionStatus: 'active',
      subscriptionFetchStatus: 'succeeded',
      currentPeriodEnd: null,
      stripeCustomerId: null,
      credits: { remaining_cents: 10000 },
    },
    plan: 'pro',
    planDisplayName: 'Pro',
    subscriptionStatus: 'active',
    subscriptionFetchStatus: 'succeeded',
    credits: { remaining_cents: 10000 },
    updateCredits: vi.fn(),
    fetchSubscription: vi.fn().mockResolvedValue({}),
    fetchCredits: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
  };

  const useAccountStore = vi.fn((selector?: (s: typeof mockAuthState) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockAuthState);
    }
    return mockAuthState;
  });

  (useAccountStore as unknown as { getState: () => typeof mockAuthState }).getState = () =>
    mockAuthState;

  return {
    useAccountStore,
    selectAccount: (state: typeof mockAuthState) => state.account,
    selectPlan: (state: typeof mockAuthState) => state.plan,
    selectPlanDisplayName: (state: typeof mockAuthState) => state.planDisplayName,
    selectSubscriptionFetchStatus: (state: typeof mockAuthState) => state.subscriptionFetchStatus,
    selectIsAuthenticated: (state: typeof mockAuthState) => state.isAuthenticated,
    selectIsPro: () => true,
    selectIsEnterprise: () => false,
    selectDisplayName: (state: typeof mockAuthState) => state.account?.displayName,
    selectEmail: (state: typeof mockAuthState) => state.account?.email,
    selectAvatar: (state: typeof mockAuthState) => state.account?.avatar,
    selectFeatureFlags: () => ({}),
    selectIsTierLoading: () => false,
    initializeAccountStore: vi.fn(),
    cleanupAccountStore: vi.fn(),
    waitForHydration: vi.fn().mockResolvedValue(undefined),
    hasFeature: vi.fn(() => false),
    getPlanDescription: vi.fn(() => 'Pro plan'),
  };
});

// Mock simpleModeStore
vi.mock('../../../stores/simpleModeStore', () => ({
  useSimpleModeStore: {
    getState: vi.fn(() => ({
      mode: 'advanced',
    })),
  },
}));

// Mock executionStore
vi.mock('../../../stores/executionStore', () => ({
  useExecutionStore: {
    getState: vi.fn(() => ({
      researchTasks: {},
      addResearchTask: vi.fn(),
      updateResearchTask: vi.fn(),
    })),
  },
}));

// Mock customInstructionsStore
vi.mock('../../../stores/customInstructionsStore', () => {
  const state = {
    globalInstructions: '',
    projectInstructions: '',
    globalInstructionsEnabled: true,
    projectInstructionsEnabled: true,
    maxInstructionsLength: 10000,
    setGlobalInstructions: vi.fn(),
    setProjectInstructions: vi.fn(),
    setGlobalInstructionsEnabled: vi.fn(),
    setProjectInstructionsEnabled: vi.fn(),
    clearAllInstructions: vi.fn(),
    saveToBackend: vi.fn().mockResolvedValue(undefined),
    loadFromBackend: vi.fn().mockResolvedValue(undefined),
    getMergedInstructions: vi.fn(() => ''),
    getInstructionsCharCount: vi.fn(() => ({ global: 0, project: 0, total: 0 })),
  };

  const useCustomInstructionsStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') {
      return selector(state);
    }
    return state;
  });

  (useCustomInstructionsStore as unknown as { getState: () => typeof state }).getState = () =>
    state;

  return { useCustomInstructionsStore };
});

// Mock chatStore (for backwards compatibility)
vi.mock('../../../stores/chatStore', () => ({
  useChatStore: vi.fn(() => ({
    conversations: [],
    activeConversation: null,
    messages: [],
    isLoading: false,
    error: null,
    loadConversations: vi.fn(),
    createConversation: vi.fn(),
    setActiveConversation: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
  })),
}));

// Import after all mocks are set up
import { UnifiedAgenticChat } from '../index';

// Setup matchMedia mock for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    media: query,
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock scrollTo for jsdom
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('UnifiedAgenticChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderChat = async (props: React.ComponentProps<typeof UnifiedAgenticChat> = {}) => {
    const result = render(<UnifiedAgenticChat {...props} />);
    // Use waitFor to let async effects settle instead of relying on setTimeout(0),
    // which can race in CI under load.
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
    return result;
  };

  it('should render without crashing', async () => {
    await renderChat();

    // The component should render - check for any rendered content
    await waitFor(() => {
      // Check that the main container is rendered
      const container = document.querySelector('.unified-agentic-chat');
      expect(container).toBeInTheDocument();
    });
  });

  it('should render the chat input area', async () => {
    await renderChat();

    await waitFor(() => {
      // Look for the input placeholder
      const input = screen.queryByPlaceholderText(/Ask me anything/i);
      expect(input).toBeInTheDocument();
    });
  });

  it('should support different layout modes', async () => {
    const { rerender } = await renderChat({ layout: 'default' });

    // Verify component renders with default layout
    await waitFor(() => {
      const container = document.querySelector('.unified-agentic-chat');
      expect(container).toBeInTheDocument();
    });

    // Test compact layout
    await act(async () => {
      rerender(<UnifiedAgenticChat layout="compact" />);
      await waitFor(() => { expect(document.body).toBeTruthy(); });
    });

    await waitFor(() => {
      const container = document.querySelector('.unified-agentic-chat');
      expect(container).toBeInTheDocument();
    });

    // Test immersive layout
    await act(async () => {
      rerender(<UnifiedAgenticChat layout="immersive" />);
      await waitFor(() => { expect(document.body).toBeTruthy(); });
    });

    await waitFor(() => {
      const container = document.querySelector('.unified-agentic-chat');
      expect(container).toBeInTheDocument();
    });
  });

  it('should handle className prop', async () => {
    await renderChat({ className: 'custom-class' });

    await waitFor(() => {
      const container = document.querySelector('.unified-agentic-chat.custom-class');
      expect(container).toBeInTheDocument();
    });
  });

  it('should render chat view by default', async () => {
    await renderChat();

    await waitFor(() => {
      // The chat view should be active by default (activeView: 'chat')
      const container = document.querySelector('.unified-agentic-chat');
      expect(container).toBeInTheDocument();
    });
  });

  it('should clear running action and tool stream state on new chat abort event', async () => {
    await renderChat();

    const state = (
      await import('../../../stores/unifiedChatStore')
    ).useUnifiedChatStore.getState() as unknown as {
      clearActionTrail: ReturnType<typeof vi.fn>;
      clearToolStreams: ReturnType<typeof vi.fn>;
    };

    await act(async () => {
      window.dispatchEvent(new CustomEvent(NEW_CHAT_ABORT_EVENT));
      await waitFor(() => { expect(document.body).toBeTruthy(); });
    });

    expect(state.clearActionTrail).toHaveBeenCalledTimes(1);
    expect(state.clearToolStreams).toHaveBeenCalledTimes(1);
  });
});
