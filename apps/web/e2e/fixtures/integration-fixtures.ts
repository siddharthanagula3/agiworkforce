/**
 * Integration Test Fixtures
 *
 * Provides reusable test setup, mocks, and data builders for
 * cross-feature integration scenarios.
 */

import { vi } from 'vitest';

// =============================================================================
// User & Preferences Fixtures
// =============================================================================

export const createMockUser = (overrides?: Partial<any>) => ({
  id: 'user-test-123',
  email: 'test@example.com',
  name: 'Test User',
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createMockPreferences = (overrides?: Partial<any>) => ({
  theme: 'light' as const,
  selectedModelId: 'claude-3-5-sonnet-20241022',
  voiceEnabled: true,
  autoStreamingEnabled: true,
  toolsEnabled: true,
  ...overrides,
});

// =============================================================================
// Model Fixtures
// =============================================================================

export const createMockModel = (id: string, overrides?: Partial<any>) => ({
  id,
  name: id.replace('claude-', 'Claude ').replace(/-/g, ' '),
  provider: id.includes('claude') ? 'anthropic' : 'unknown',
  contextWindow: 200000,
  costPerMillion: { input: 3, output: 15 },
  supports: {
    streaming: true,
    vision: true,
    tools: true,
    thinking: id.includes('sonnet') || id.includes('opus'),
  },
  ...overrides,
});

export const mockModels = {
  'claude-3-5-sonnet-20241022': createMockModel('claude-3-5-sonnet-20241022'),
  'claude-3-5-haiku-20241022': createMockModel('claude-3-5-haiku-20241022'),
  'claude-3-opus-20250219': createMockModel('claude-3-opus-20250219'),
};

// =============================================================================
// Chat & Message Fixtures
// =============================================================================

export const createMockMessage = (
  content: string,
  role: 'user' | 'assistant',
  overrides?: Partial<any>,
) => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  content,
  role,
  createdAt: new Date().toISOString(),
  tokens: content.split(/\s+/).length * 1.3, // rough estimate
  ...overrides,
});

export const createMockConversation = (overrides?: Partial<any>) => ({
  id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  title: 'Test Conversation',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
  selectedModelId: 'claude-3-5-sonnet-20241022',
  ...overrides,
});

// =============================================================================
// Tool Execution Fixtures
// =============================================================================

export const createMockToolCall = (toolName: string, overrides?: Partial<any>) => ({
  id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: toolName,
  input: {},
  createdAt: new Date().toISOString(),
  status: 'pending' as const,
  ...overrides,
});

export const createMockToolResult = (toolName: string, result: any = {}) => ({
  id: `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  toolName,
  status: 'success' as const,
  result,
  duration_ms: 150,
});

export const mockToolAvailability = {
  read: { available: true, description: 'Read file content' },
  write: { available: true, description: 'Write to file' },
  bash: { available: true, description: 'Execute shell command' },
  web_search: { available: true, description: 'Search the web' },
  vision: { available: true, description: 'Analyze images' },
};

// =============================================================================
// Streaming Fixtures
// =============================================================================

export const createMockStreamChunk = (content: string, index: number = 0) => ({
  type: 'content_block_delta' as const,
  delta: {
    type: 'text_delta' as const,
    text: content,
  },
  index,
});

export const createMockToolUseStreamChunk = (
  toolName: string,
  toolInput: any,
  index: number = 0,
) => ({
  type: 'content_block_delta' as const,
  delta: {
    type: 'input_json_delta' as const,
    partial_json: JSON.stringify(toolInput),
  },
  index,
});

// Stream complete event
export const createMockStreamEnd = () => ({
  type: 'message_stop' as const,
});

// =============================================================================
// Error Scenarios
// =============================================================================

export const mockErrorScenarios = {
  networkTimeout: new Error('Network timeout'),
  toolExecutionFailed: new Error('Tool execution failed'),
  modelUnavailable: new Error('Model not available'),
  streamInterrupted: new Error('Stream interrupted by user'),
  invalidInput: new Error('Invalid input format'),
};

// =============================================================================
// Mock Store Builders
// =============================================================================

export const createMockModelStore = (selectedModelId: string = 'claude-3-5-sonnet-20241022') => ({
  getState: vi.fn(() => ({
    selectedModelId,
    models: mockModels,
  })),
  setState: vi.fn(),
  subscribe: vi.fn(),
});

export const createMockChatStore = (conversationId: string = 'conv-test-123') => ({
  getState: vi.fn(() => ({
    currentConversationId: conversationId,
    conversations: {},
    messages: {},
    isStreaming: false,
    selectedModelId: 'claude-3-5-sonnet-20241022',
  })),
  setState: vi.fn(),
  subscribe: vi.fn(),
});

export const createMockToolStore = (toolName?: string) => ({
  getState: vi.fn(() => ({
    executingTools: toolName ? [toolName] : [],
    toolResults: {},
    toolAvailability: mockToolAvailability,
  })),
  setState: vi.fn(),
  subscribe: vi.fn(),
});

// =============================================================================
// Mock API Builders
// =============================================================================

/**
 * Create a mock API response for streaming chat completion
 */
export const createMockStreamingResponse = (chunks: string[]) => {
  let chunkIndex = 0;
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(createMockStreamChunk(chunk, chunkIndex));
        chunkIndex++;
      }
      controller.enqueue(createMockStreamEnd());
      controller.close();
    },
  });
};

/**
 * Create mock fetch response for tool execution
 */
export const createMockToolExecutionResponse = (toolName: string, result: any) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    success: true,
    toolName,
    result,
  }),
});

/**
 * Create mock fetch response for error scenario
 */
export const createMockErrorResponse = (statusCode: number, message: string) => ({
  ok: false,
  status: statusCode,
  json: vi.fn().mockResolvedValue({
    error: message,
  }),
});

// =============================================================================
// Convenience Builders
// =============================================================================

/**
 * Setup complete chat scenario with user, conversation, and messages
 */
export const setupChatScenario = (overrides?: {
  userId?: string;
  conversationId?: string;
  selectedModelId?: string;
  messageCount?: number;
}) => {
  const userId = overrides?.userId || 'user-test-123';
  const conversationId = overrides?.conversationId || 'conv-test-456';
  const selectedModelId = overrides?.selectedModelId || 'claude-3-5-sonnet-20241022';
  const messageCount = overrides?.messageCount || 3;

  const user = createMockUser({ id: userId });
  const conversation = createMockConversation({
    id: conversationId,
    selectedModelId,
  });

  const messages = [];
  for (let i = 0; i < messageCount; i++) {
    const isUser = i % 2 === 0;
    messages.push(
      createMockMessage(
        isUser ? `User message ${i + 1}` : `Assistant response ${i + 1}`,
        isUser ? 'user' : 'assistant',
      ),
    );
  }

  return {
    user,
    conversation: { ...conversation, messages },
    messages,
  };
};

/**
 * Setup tool execution scenario
 */
export const setupToolExecutionScenario = (toolName: string = 'read') => {
  const toolCall = createMockToolCall(toolName);
  const toolResult = createMockToolResult(toolName, { content: 'Tool executed successfully' });

  return {
    toolCall,
    toolResult,
    conversation: createMockConversation({
      messages: [
        createMockMessage('Please read the file', 'user'),
        createMockMessage(`Executing tool: ${toolName}`, 'assistant', { toolCall }),
      ],
    }),
  };
};

/**
 * Setup streaming scenario with interruption
 */
export const setupStreamingScenario = () => {
  const initialChunks = [
    'I will help you with ',
    'that task. Let me ',
    'break it down into steps...',
  ];

  const interruptionPoint = 2; // Interrupt after 2 chunks

  const userMessage = createMockMessage('Help me with this complex task', 'user');
  const assistantMessage = createMockMessage('', 'assistant', {
    status: 'streaming',
  });

  return {
    userMessage,
    assistantMessage,
    initialChunks,
    interruptionPoint,
  };
};
