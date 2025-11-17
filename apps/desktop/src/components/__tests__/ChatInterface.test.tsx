// Updated Nov 16, 2025: Fixed test to actually test ChatInterface component
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatInterface } from '../Chat/ChatInterface';

// Mock all stores
vi.mock('../../stores/chatStore', () => ({
  useChatStore: vi.fn(() => ({
    messages: [],
    loading: false,
    loadConversations: vi.fn(),
    sendMessage: vi.fn(),
    activeConversationId: null,
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
  })),
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      llmConfig: {
        defaultProvider: 'anthropic' as const,
        temperature: 0.7,
        maxTokens: 4096,
        defaultModels: {
          openai: 'gpt-4',
          anthropic: 'claude-sonnet-4-5',
          google: 'gemini-2.5-pro',
          ollama: 'llama4-maverick',
          xai: 'grok-4',
          deepseek: 'deepseek-v3',
          qwen: 'qwen-max',
          mistral: 'mistral-large-2',
        },
        favoriteModels: [],
      },
    };
    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

vi.mock('../../stores/tokenBudgetStore', () => ({
  useTokenBudgetStore: vi.fn((selector) => {
    const state = {
      budget: {
        enabled: false,
        dailyLimit: 100000,
        weeklyLimit: 500000,
        monthlyLimit: 2000000,
        currentUsage: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      },
      addTokenUsage: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  }),
  selectBudget: (state: any) => state.budget,
}));

// Mock child components to simplify testing
vi.mock('../Chat/MessageList', () => ({
  MessageList: ({ messages }: any) => (
    <div data-testid="message-list">Messages: {messages.length}</div>
  ),
}));

vi.mock('../Chat/InputComposer', () => ({
  InputComposer: () => <div data-testid="input-composer">Input Composer</div>,
}));

vi.mock('../Chat/TokenCounter', () => ({
  TokenCounter: () => <div data-testid="token-counter">Token Counter</div>,
}));

vi.mock('../Chat/BudgetAlertsPanel', () => ({
  BudgetAlertsPanel: () => <div data-testid="budget-alerts">Budget Alerts</div>,
}));

vi.mock('../Layout/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">Status Bar</div>,
}));

vi.mock('../AGI/ProgressIndicator', () => ({
  ProgressIndicator: () => <div data-testid="progress-indicator">Progress</div>,
}));

describe('ChatInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<ChatInterface />);
    expect(container).toBeDefined();
  });

  it('should render child components', () => {
    render(<ChatInterface />);

    expect(screen.getByTestId('message-list')).toBeDefined();
    expect(screen.getByTestId('input-composer')).toBeDefined();
    expect(screen.getByTestId('token-counter')).toBeDefined();
  });

  it('should call loadConversations on mount', async () => {
    const mockLoadConversations = vi.fn();

    const { useChatStore } = await import('../../stores/chatStore');
    (useChatStore as any).mockReturnValue({
      messages: [],
      loading: false,
      loadConversations: mockLoadConversations,
      sendMessage: vi.fn(),
      activeConversationId: null,
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    });

    render(<ChatInterface />);

    await waitFor(() => {
      expect(mockLoadConversations).toHaveBeenCalled();
    });
  });

  it('should apply custom className when provided', () => {
    const { container } = render(<ChatInterface className="custom-class" />);

    const chatInterface = container.firstChild as HTMLElement;
    expect(chatInterface?.className).toContain('custom-class');
  });

  it('should display messages when available', async () => {
    const mockMessages = [
      { id: 1, role: 'user' as const, content: 'Hello', timestamp: new Date(), tokens: 5 },
      { id: 2, role: 'assistant' as const, content: 'Hi there!', timestamp: new Date(), tokens: 7 },
    ];

    const { useChatStore } = await import('../../stores/chatStore');
    (useChatStore as any).mockReturnValue({
      messages: mockMessages,
      loading: false,
      loadConversations: vi.fn(),
      sendMessage: vi.fn(),
      activeConversationId: 1,
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    });

    render(<ChatInterface />);

    const messageList = screen.getByTestId('message-list');
    expect(messageList.textContent).toContain('Messages: 2');
  });

  it('should handle loading state', async () => {
    const { useChatStore } = await import('../../stores/chatStore');
    (useChatStore as any).mockReturnValue({
      messages: [],
      loading: true,
      loadConversations: vi.fn(),
      sendMessage: vi.fn(),
      activeConversationId: null,
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    });

    render(<ChatInterface />);

    // Component should still render when loading
    expect(screen.getByTestId('message-list')).toBeDefined();
  });

  it('should render with budget tracking enabled', async () => {
    const { useTokenBudgetStore } = await import('../../stores/tokenBudgetStore');
    (useTokenBudgetStore as any).mockImplementation((selector: any) => {
      const state = {
        budget: {
          enabled: true,
          dailyLimit: 10000,
          weeklyLimit: 50000,
          monthlyLimit: 200000,
          currentUsage: {
            daily: 1000,
            weekly: 5000,
            monthly: 20000,
          },
        },
        addTokenUsage: vi.fn(),
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<ChatInterface />);

    expect(screen.getByTestId('budget-alerts')).toBeDefined();
  });
});
