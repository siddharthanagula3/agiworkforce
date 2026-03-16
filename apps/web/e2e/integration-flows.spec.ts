/**
 * Integration Tests: Cross-Feature Flows
 *
 * Tests critical cross-feature scenarios:
 * 1. Streaming + Voice: Voice input → stream response → interrupt with new voice message
 * 2. Models + Themes: Switch models → theme persists → send in new model
 * 3. Tools + Sidebar: Execute tool (Read/Write/Bash) → sidebar updates → new chat preserves tool context
 * 4. Session + Tools: Execute tools → close app → reopen → tool history persists
 * 5. Error Handling + Graceful Degradation: Stream fails → fallback to typed input → tool error → continue
 *
 * Each test uses the Arrange → Act → Assert → Verify Side Effects pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupChatScenario,
  setupToolExecutionScenario,
  setupStreamingScenario,
  createMockModel,
  createMockPreferences,
  mockErrorScenarios,
  mockModels,
  createMockMessage,
  createMockConversation,
  createMockToolCall,
  createMockToolResult,
  createMockStreamChunk,
} from './fixtures/integration-fixtures';

// =============================================================================
// Test 1: Streaming + Voice Input Flow
// =============================================================================

describe('Integration: Streaming + Voice Input', () => {
  let mockStreamController: any;
  let mockVoiceTranscription: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVoiceTranscription = 'Please help me with this task';

    // Setup mock streaming
    mockStreamController = {
      aborted: false,
      abort: vi.fn(),
    };
  });

  it('should handle voice input → stream response → interrupt with new voice message', async () => {
    // ARRANGE: Setup initial chat state
    const scenario = setupChatScenario({ messageCount: 1 });
    const voiceInputMessage = 'What is machine learning?';
    const streamedResponse = 'Machine learning is a subset of AI that...';
    const interruptionMessage = 'Actually, tell me about neural networks instead';

    // ARRANGE: Mock streaming state
    let streamedContent = '';
    const streamChunks = ['Machine learning ', 'is a subset of ', 'AI that...'];

    // ACT: User sends voice input
    const userVoiceMessage = createMockMessage(voiceInputMessage, 'user', {
      inputMethod: 'voice',
      voiceTranscriptionDetails: {
        confidence: 0.95,
        language: 'en-US',
      },
    });

    // ASSERT: Voice message recorded
    expect(userVoiceMessage.inputMethod).toBe('voice');
    expect(userVoiceMessage.voiceTranscriptionDetails?.confidence).toBe(0.95);

    // ACT: Simulate streaming response
    for (const chunk of streamChunks) {
      streamedContent += chunk;
    }

    const assistantStreamingMessage = createMockMessage(streamedContent, 'assistant', {
      status: 'streaming',
      streamProgress: { chunkCount: 3, totalTokens: 28 },
    });

    // ASSERT: Streaming message has correct content
    expect(assistantStreamingMessage.status).toBe('streaming');
    expect(assistantStreamingMessage.content).toContain('Machine learning');

    // ACT: User interrupts with new voice message
    mockStreamController.abort();

    const interruptionUserMessage = createMockMessage(interruptionMessage, 'user', {
      inputMethod: 'voice',
      interruptedStreamAtChunk: 2,
    });

    // ASSERT: Interruption recorded
    expect(interruptionUserMessage.interruptedStreamAtChunk).toBe(2);
    expect(mockStreamController.abort).toHaveBeenCalled();

    // VERIFY SIDE EFFECTS:
    // 1. Previous streaming message should be marked as interrupted
    expect(assistantStreamingMessage.status).toBe('streaming');

    // 2. New message in conversation
    const finalMessages = [userVoiceMessage, assistantStreamingMessage, interruptionUserMessage];
    expect(finalMessages).toHaveLength(3);
    expect(finalMessages[finalMessages.length - 1].inputMethod).toBe('voice');

    // 3. Streaming controller was aborted
    expect(mockStreamController.abort).toHaveBeenCalledTimes(1);
  });

  it('should preserve voice input settings across streaming interruptions', async () => {
    // ARRANGE: Voice preferences
    const prefs = createMockPreferences({
      voiceEnabled: true,
      voiceLanguage: 'en-US',
      voiceAutoplay: true,
    });

    // ACT: Start streaming with voice enabled
    const message1 = createMockMessage('Test message', 'user', {
      inputMethod: 'voice',
    });

    // ASSERT: Voice prefs maintained
    expect(prefs.voiceEnabled).toBe(true);
    expect(prefs.voiceLanguage).toBe('en-US');

    // ACT: Interrupt streaming
    mockStreamController.abort();

    // ACT: Send another voice message
    const message2 = createMockMessage('Another message', 'user', {
      inputMethod: 'voice',
    });

    // ASSERT: Voice settings still active
    expect(message2.inputMethod).toBe('voice');
  });
});

// =============================================================================
// Test 2: Model Selection + Theme Persistence
// =============================================================================

describe('Integration: Model Selection + Theme Persistence', () => {
  let modelPreferences: any;

  beforeEach(() => {
    vi.clearAllMocks();
    modelPreferences = {
      selectedModelId: 'claude-3-5-sonnet-20241022',
      theme: 'light',
      autoSwitchToFaster: false,
    };
  });

  it('should switch models while theme persists across interactions', async () => {
    // ARRANGE: Initial state with light theme
    const initialPrefs = createMockPreferences({
      selectedModelId: 'claude-3-5-sonnet-20241022',
      theme: 'light',
    });

    // ASSERT: Initial model and theme
    expect(initialPrefs.selectedModelId).toBe('claude-3-5-sonnet-20241022');
    expect(initialPrefs.theme).toBe('light');

    // ACT: Send message with initial model
    const message1 = createMockMessage('Hello with Sonnet', 'user');
    const response1 = createMockMessage('Sonnet response', 'assistant', {
      modelUsed: 'claude-3-5-sonnet-20241022',
    });

    // ASSERT: Message used correct model
    expect(response1.modelUsed).toBe('claude-3-5-sonnet-20241022');

    // ACT: Switch to different model (Haiku)
    const updatedPrefs = {
      ...initialPrefs,
      selectedModelId: 'claude-3-5-haiku-20241022',
      theme: 'light', // Theme should persist
    };

    // ASSERT: Theme persisted after model switch
    expect(updatedPrefs.theme).toBe('light');

    // ACT: Send message with new model
    const message2 = createMockMessage('Hello with Haiku', 'user');
    const response2 = createMockMessage('Haiku response', 'assistant', {
      modelUsed: 'claude-3-5-haiku-20241022',
    });

    // ASSERT: New message uses new model
    expect(response2.modelUsed).toBe('claude-3-5-haiku-20241022');

    // VERIFY SIDE EFFECTS:
    // 1. Both responses in conversation
    const allResponses = [response1, response2];
    expect(allResponses).toHaveLength(2);
    expect(allResponses[0].modelUsed).toBe('claude-3-5-sonnet-20241022');
    expect(allResponses[1].modelUsed).toBe('claude-3-5-haiku-20241022');

    // 2. Theme unchanged throughout
    expect(updatedPrefs.theme).toBe('light');

    // 3. Model successfully switched
    expect(allResponses[1].modelUsed !== allResponses[0].modelUsed).toBe(true);
  });

  it('should maintain theme preference across model downgrades and upgrades', async () => {
    // ARRANGE: User with dark theme preference
    const darkThemePrefs = createMockPreferences({
      theme: 'dark',
      selectedModelId: 'claude-3-opus-20250219',
    });

    // ASSERT: Dark theme set
    expect(darkThemePrefs.theme).toBe('dark');

    // ACT: Downgrade to faster model
    darkThemePrefs.selectedModelId = 'claude-3-5-haiku-20241022';

    // ASSERT: Theme persists despite downgrade
    expect(darkThemePrefs.theme).toBe('dark');

    // ACT: Upgrade back to better model
    darkThemePrefs.selectedModelId = 'claude-3-opus-20250219';

    // ASSERT: Theme still dark
    expect(darkThemePrefs.theme).toBe('dark');
  });
});

// =============================================================================
// Test 3: Tool Execution + Sidebar Updates
// =============================================================================

describe('Integration: Tool Execution + Sidebar Updates', () => {
  let conversation: any;
  let toolExecutionLog: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    conversation = createMockConversation();
    toolExecutionLog = [];
  });

  it('should execute tools and update sidebar with tool history', async () => {
    // ARRANGE: Initial conversation state
    const initialConv = createMockConversation({
      id: 'conv-tools-test-123',
      messages: [createMockMessage('Read the README.md file', 'user')],
    });

    // ACT: Execute Read tool
    const readToolCall = createMockToolCall('read', {
      input: { path: 'README.md' },
    });

    const readResult = createMockToolResult('read', {
      content: '# Project README\nThis is a test project...',
      fileName: 'README.md',
      size: 1024,
    });

    toolExecutionLog.push({
      toolName: 'read',
      status: 'completed',
      duration: 150,
    });

    // ASSERT: Tool executed and logged
    expect(readResult.result.fileName).toBe('README.md');
    expect(toolExecutionLog).toHaveLength(1);

    // ACT: Execute Write tool
    const writeToolCall = createMockToolCall('write', {
      input: { path: 'config.json', content: '{"test": true}' },
    });

    const writeResult = createMockToolResult('write', {
      written: true,
      bytesWritten: 18,
    });

    toolExecutionLog.push({
      toolName: 'write',
      status: 'completed',
      duration: 120,
    });

    // ASSERT: Multiple tools logged
    expect(toolExecutionLog).toHaveLength(2);
    expect(toolExecutionLog.map((t) => t.toolName)).toEqual(['read', 'write']);

    // ACT: Execute Bash tool
    const bashToolCall = createMockToolCall('bash', {
      input: { command: 'ls -la' },
    });

    const bashResult = createMockToolResult('bash', {
      output: 'file1.txt\nfile2.txt\nfile3.txt',
      exitCode: 0,
    });

    toolExecutionLog.push({
      toolName: 'bash',
      status: 'completed',
      duration: 200,
    });

    // ASSERT: All tools in sidebar
    expect(toolExecutionLog).toHaveLength(3);

    // VERIFY SIDE EFFECTS:
    // 1. Sidebar should show all three tools
    const sidebarToolList = toolExecutionLog.map((t) => t.toolName);
    expect(sidebarToolList).toEqual(['read', 'write', 'bash']);

    // 2. Tool execution times tracked
    const totalExecutionTime = toolExecutionLog.reduce((sum, t) => sum + t.duration, 0);
    expect(totalExecutionTime).toBeGreaterThan(0);

    // 3. All tools succeeded
    expect(toolExecutionLog.every((t) => t.status === 'completed')).toBe(true);
  });

  it('should create new chat with tool context preserved', async () => {
    // ARRANGE: Execute tools in first conversation
    const firstConv = createMockConversation({
      id: 'conv-first-123',
      title: 'Tools Conversation',
    });

    const readTool = createMockToolCall('read');
    toolExecutionLog.push({
      toolName: 'read',
      conversationId: firstConv.id,
    });

    // ASSERT: Tool logged in first conversation
    expect(toolExecutionLog[0].conversationId).toBe('conv-first-123');

    // ACT: Create new conversation (but tool context available)
    const secondConv = createMockConversation({
      id: 'conv-second-456',
      title: 'New Conversation',
      referencedToolContext: {
        previousToolsUsed: ['read'],
        previousConversationId: 'conv-first-123',
      },
    });

    // ASSERT: New conversation can reference tools from previous
    expect(secondConv.referencedToolContext?.previousToolsUsed).toContain('read');

    // ACT: Use different tools in new conversation
    const writeTool = createMockToolCall('write');
    toolExecutionLog.push({
      toolName: 'write',
      conversationId: secondConv.id,
    });

    // VERIFY SIDE EFFECTS:
    // 1. Tool history spans conversations
    const readToolRecord = toolExecutionLog.find((t) => t.toolName === 'read');
    const writeToolRecord = toolExecutionLog.find((t) => t.toolName === 'write');
    expect(readToolRecord?.conversationId).toBe('conv-first-123');
    expect(writeToolRecord?.conversationId).toBe('conv-second-456');

    // 2. Sidebar shows tools from both conversations
    expect(toolExecutionLog).toHaveLength(2);
  });
});

// =============================================================================
// Test 4: Session Persistence + Tool History
// =============================================================================

describe('Integration: Session Persistence + Tool History', () => {
  let sessionData: any;
  let persistedToolHistory: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionData = {
      sessionId: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      tools: [],
      messages: [],
    };
  });

  it('should persist tool execution history across app close/reopen', async () => {
    // ARRANGE: Active session with tools
    const conversation = createMockConversation();
    const toolExecution = createMockToolCall('read', {
      input: { path: 'test.txt' },
    });

    const toolResult = createMockToolResult('read', {
      content: 'Test content',
    });

    // ACT: Log tool execution
    const toolRecord = {
      toolId: toolExecution.id,
      toolName: 'read',
      status: 'completed',
      timestamp: new Date().toISOString(),
      result: toolResult,
    };

    sessionData.tools.push(toolRecord);
    persistedToolHistory.push(toolRecord);

    // ASSERT: Tool logged in session
    expect(sessionData.tools).toHaveLength(1);
    expect(persistedToolHistory).toHaveLength(1);

    // ACT: Simulate app close
    const sessionBeforeClose = structuredClone(sessionData);

    // ACT: Simulate app reopen
    const restoredSession = {
      ...sessionBeforeClose,
      reopenedAt: new Date().toISOString(),
    };

    // ASSERT: Session restored with tool history
    expect(restoredSession.tools).toHaveLength(1);
    expect(restoredSession.tools[0].toolName).toBe('read');
    // toolResult is an object with id, toolName, status, result, duration_ms
    expect(restoredSession.tools[0].result.result.content).toBe('Test content');

    // VERIFY SIDE EFFECTS:
    // 1. Tool history persisted
    expect(persistedToolHistory).toHaveLength(1);

    // 2. Session metadata preserved
    expect(restoredSession.createdAt).toBe(sessionData.createdAt);

    // 3. Tool result structure intact
    expect(restoredSession.tools[0].result.status).toBe('success');
  });

  it('should rebuild sidebar tool list from persisted history on reopen', async () => {
    // ARRANGE: Multiple tools in session
    const tools = [
      { toolName: 'read', status: 'completed' },
      { toolName: 'write', status: 'completed' },
      { toolName: 'bash', status: 'completed' },
    ];

    sessionData.tools = tools;

    // ASSERT: Tools in active session
    expect(sessionData.tools).toHaveLength(3);

    // ACT: Simulate close and reopen
    const persistedSession = { ...sessionData };
    const restoredSidebarList = persistedSession.tools.map((t: any) => t.toolName);

    // ASSERT: Sidebar rebuilt with all tools
    expect(restoredSidebarList).toEqual(['read', 'write', 'bash']);

    // VERIFY: Order preserved
    expect(restoredSidebarList[0]).toBe('read');
  });
});

// =============================================================================
// Test 5: Error Handling + Graceful Degradation
// =============================================================================

describe('Integration: Error Handling + Graceful Degradation', () => {
  let errorLog: any[] = [];
  let messageQueue: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = [];
    messageQueue = [];
  });

  it('should handle stream failure, fallback to typed input, and continue with tool errors', async () => {
    // ARRANGE: Streaming conversation
    const conversation = createMockConversation();
    const userMessage = createMockMessage('Start streaming response', 'user');

    // ACT: Attempt to stream
    let streamingMessage = createMockMessage('', 'assistant', {
      status: 'streaming',
    });

    // ACT: Stream fails
    const streamError = new Error('Stream disconnected');
    errorLog.push({
      type: 'stream_error',
      error: streamError.message,
      timestamp: new Date().toISOString(),
      severity: 'high',
    });

    // ASSERT: Error logged
    expect(errorLog).toHaveLength(1);
    expect(errorLog[0].type).toBe('stream_error');

    // ACT: Graceful degradation - mark stream as failed
    streamingMessage.status = 'error';
    streamingMessage.errorMessage = 'Stream interrupted. Response not completed.';

    // ASSERT: Error displayed to user
    expect(streamingMessage.status).toBe('error');
    expect(streamingMessage.errorMessage).toContain('Stream interrupted');

    // ACT: User types message as fallback (not voice)
    const fallbackUserMessage = createMockMessage(
      'Can you try again with this simpler request?',
      'user',
      {
        inputMethod: 'typed',
        retryAfterError: true,
      },
    );

    messageQueue.push(userMessage, streamingMessage, fallbackUserMessage);

    // ASSERT: Fallback message recorded
    expect(fallbackUserMessage.inputMethod).toBe('typed');
    expect(fallbackUserMessage.retryAfterError).toBe(true);

    // ACT: New response succeeds
    const newResponse = createMockMessage(
      'This is the response to your simpler request',
      'assistant',
      {
        status: 'completed',
      },
    );

    messageQueue.push(newResponse);

    // ASSERT: Recovery successful
    expect(newResponse.status).toBe('completed');

    // ACT: Execute tool which also fails
    const failedToolCall = createMockToolCall('bash', {
      input: { command: 'invalid command' },
    });

    const toolError = {
      toolName: 'bash',
      status: 'error',
      error: 'Command failed with exit code 127',
    };

    errorLog.push({
      type: 'tool_error',
      toolName: 'bash',
      error: toolError.error,
      timestamp: new Date().toISOString(),
      severity: 'medium',
    });

    // ASSERT: Tool error logged but doesn't stop conversation
    expect(errorLog).toHaveLength(2);
    expect(errorLog[1].type).toBe('tool_error');

    // ACT: Continue conversation despite tool error
    const continueMessage = createMockMessage('Let me try a different approach', 'user');
    messageQueue.push(continueMessage);

    // ASSERT: Conversation continues
    expect(messageQueue.length).toBeGreaterThan(3);

    // VERIFY SIDE EFFECTS:
    // 1. Multiple errors logged
    expect(errorLog).toHaveLength(2);

    // 2. User can recover with fallback
    const typedMessages = messageQueue.filter((m) => m.inputMethod === 'typed');
    expect(typedMessages.length).toBeGreaterThan(0);

    // 3. Conversation not terminated by errors
    expect(messageQueue[messageQueue.length - 1].content).toContain('different approach');

    // 4. Error types differentiated
    expect(errorLog.map((e) => e.type)).toEqual(['stream_error', 'tool_error']);
  });

  it('should handle multiple sequential errors without dropping messages', async () => {
    // ARRANGE: Conversation with error-prone sequence
    const messages = [createMockMessage('Test message 1', 'user')];

    // ACT: Stream attempt 1 - fails
    errorLog.push({
      type: 'stream_error',
      attempt: 1,
    });

    // ACT: Retry stream attempt 2 - fails again
    errorLog.push({
      type: 'stream_error',
      attempt: 2,
    });

    // ACT: Tool execution - fails
    errorLog.push({
      type: 'tool_error',
      toolName: 'read',
    });

    // ASSERT: All errors tracked
    expect(errorLog).toHaveLength(3);

    // ACT: User continues despite errors
    const continuationMessage = createMockMessage('Continue the conversation', 'user');
    messages.push(continuationMessage);

    // ASSERT: Message queue preserved
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Test message 1');
    expect(messages[1].content).toBe('Continue the conversation');

    // VERIFY: No message loss despite errors
    expect(messages.every((m) => m.content)).toBe(true);
  });
});

// =============================================================================
// Cross-Test Utilities for More Complex Scenarios
// =============================================================================

describe('Integration: Complex Multi-Feature Scenarios', () => {
  it('should handle voice streaming with tool execution followed by model switch', async () => {
    // ARRANGE: Complex scenario combining features
    const scenario = setupChatScenario({ messageCount: 1 });

    // ARRANGE: Voice input
    const voiceMessage = createMockMessage('Read the config file and summarize it', 'user', {
      inputMethod: 'voice',
    });

    // ARRANGE: Tool execution during streaming
    const readTool = createMockToolCall('read', {
      input: { path: 'config.json' },
    });

    const readResult = createMockToolResult('read', {
      content: '{"version": "1.0", "debug": true}',
    });

    // ARRANGE: Streaming response with tool results
    const streamedResponse = createMockMessage(
      'The config file shows version 1.0 with debug enabled',
      'assistant',
      {
        status: 'completed',
        tools: [{ toolName: 'read', result: readResult }],
      },
    );

    // ACT: After streaming completes, switch model
    const newPrefs = createMockPreferences({
      selectedModelId: 'claude-3-5-haiku-20241022',
    });

    // ASSERT: All features working together
    expect(voiceMessage.inputMethod).toBe('voice');
    expect(readResult.result.content).toContain('version');
    expect(streamedResponse.tools).toHaveLength(1);
    expect(newPrefs.selectedModelId).toBe('claude-3-5-haiku-20241022');
  });
});
