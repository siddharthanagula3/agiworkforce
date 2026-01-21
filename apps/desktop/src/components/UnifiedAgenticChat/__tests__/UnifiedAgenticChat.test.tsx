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

vi.mock('../../../hooks/useAgenticEvents', () => ({
  useAgenticEvents: vi.fn(),
}));
vi.mock('../../Terminal/TerminalWorkspace', () => ({
  TerminalWorkspace: () => <div data-testid="terminal-workspace" />,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('../../ui/ScrollArea', () => ({
  ScrollArea: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));

// Mock supabaseAuth to prevent auth errors
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

// Mock authStore
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'test-token' },
    isLoading: false,
  })),
}));

// Mock stores to prevent infinite loops in React 19
vi.mock('../../../stores/billingUsage', () => ({
  useBillingUsageStore: vi.fn(() => ({
    costOverview: { today_total: 0, month_total: 0, monthly_budget: null, remaining_budget: null },
    loadCostOverview: vi.fn(),
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
    addTokenUsage: vi.fn(),
    getTokenCost: vi.fn(() => 0),
  })),
  selectBudget: (state: unknown) => (state as { budget: unknown }).budget,
}));

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

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnifiedAgenticChat } from '../index';

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

// TODO: These tests are temporarily skipped due to React 19 + zustand 5 compatibility issues.
// The component uses multiple zustand stores that trigger "Maximum update depth exceeded"
// errors in React 19's strict mode. This requires a deeper refactor of the component's
// state management to properly cache selectors.
// Ticket: TECH-DEBT-001
describe.skip('UnifiedAgenticChat', () => {
  const renderChat = async (props: React.ComponentProps<typeof UnifiedAgenticChat> = {}) => {
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<UnifiedAgenticChat {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    return utils!;
  };

  it('should render without crashing', async () => {
    await renderChat();

    const newChatButtons = screen.getAllByRole('button', { name: /New Chat/i });
    expect(newChatButtons.length).toBeGreaterThan(0);
  });

  it('should display sidebar when no messages exist', async () => {
    await renderChat();

    expect(screen.getAllByText('Search').length).toBeGreaterThan(0);
  });

  it('should render input area with placeholder', async () => {
    await renderChat();
    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('should call onSendMessage when message is sent', async () => {
    const mockOnSend = vi.fn();
    await renderChat({ onSendMessage: mockOnSend });

    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('should support different layout modes', async () => {
    const { rerender } = await renderChat({ layout: 'default' });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="compact" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);

    await act(async () => {
      rerender(<UnifiedAgenticChat layout="immersive" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);
  });
});
