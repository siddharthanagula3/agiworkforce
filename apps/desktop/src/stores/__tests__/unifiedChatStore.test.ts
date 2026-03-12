import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enableMapSet } from 'immer';
import { useUnifiedChatStore } from '../unifiedChatStore';
import { useUIStore } from '../ui';

// Enable Immer's MapSet plugin for Map/Set support in stores
enableMapSet();

describe('unifiedChatStore', () => {
  beforeEach(() => {
    useUnifiedChatStore.setState({
      messages: [],
      actionTrail: [],
      actionLog: [],
      fileOperations: [],
      terminalCommands: [],
      toolExecutions: [],
      screenshots: [],
      agents: [],
      backgroundTasks: [],
      pendingApprovals: [],
      activeContext: [],
      isLoading: false,
      isStreaming: false,
      currentStreamingMessageId: null,
      sidecarOpen: true,
      sidecarSection: 'operations',
      sidecarWidth: 400,
    });
  });

  afterEach(() => {
    const store = useUnifiedChatStore.getState();
    if (store.currentStreamingMessageId) {
      store.setStreamingMessage(null);
    }
  });

  it('should initialize with empty state', () => {
    const state = useUnifiedChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.fileOperations).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.isStreaming).toBe(false);
  });

  it('should add a message', () => {
    const { addMessage } = useUnifiedChatStore.getState();
    addMessage({
      role: 'user',
      content: 'Hello, world!',
    });

    const state = useUnifiedChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe('Hello, world!');
    expect(state.messages[0]?.role).toBe('user');
    expect(state.messages[0]?.id).toBeDefined();
    expect(state.messages[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('should update a message', () => {
    const { addMessage, updateMessage } = useUnifiedChatStore.getState();
    addMessage({
      role: 'assistant',
      content: 'Original content',
    });

    const state = useUnifiedChatStore.getState();
    const messageId = state.messages[0]?.id;
    expect(messageId).toBeDefined();

    updateMessage(messageId!, { content: 'Updated content' });

    const updatedState = useUnifiedChatStore.getState();
    expect(updatedState.messages[0]?.content).toBe('Updated content');
  });

  it('should delete a message', () => {
    const { addMessage, deleteMessage } = useUnifiedChatStore.getState();
    addMessage({
      role: 'user',
      content: 'To be deleted',
    });

    const state = useUnifiedChatStore.getState();
    const messageId = state.messages[0]?.id;
    expect(messageId).toBeDefined();

    deleteMessage(messageId!);

    const updatedState = useUnifiedChatStore.getState();
    expect(updatedState.messages).toHaveLength(0);
  });

  it('should manage streaming state', () => {
    const { setStreamingMessage } = useUnifiedChatStore.getState();

    setStreamingMessage('test-id');
    let state = useUnifiedChatStore.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.currentStreamingMessageId).toBe('test-id');

    setStreamingMessage(null);
    state = useUnifiedChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.currentStreamingMessageId).toBe(null);
  });

  it('should add file operation', () => {
    const { addFileOperation } = useUnifiedChatStore.getState();
    addFileOperation({
      id: 'op-1',
      type: 'write',
      filePath: '/test/file.txt',
      success: true,
    });

    const state = useUnifiedChatStore.getState();
    expect(state.fileOperations).toHaveLength(1);
    expect(state.fileOperations[0]?.type).toBe('write');
    expect(state.fileOperations[0]?.filePath).toBe('/test/file.txt');
  });

  it('should manage sidecar state', () => {
    const { setSidecarOpen, setSidecarSection, setSidecarWidth } = useUnifiedChatStore.getState();

    setSidecarOpen(false);
    let state = useUnifiedChatStore.getState();
    expect(state.sidecarOpen).toBe(false);

    setSidecarSection('files');
    state = useUnifiedChatStore.getState();
    expect(state.sidecarSection).toBe('files');

    setSidecarWidth(500);
    state = useUnifiedChatStore.getState();
    expect(state.sidecarWidth).toBe(500);
  });

  it('should route setState({sidecarSection}) to the UI/sidecar sub-store (C7)', () => {
    // Use the unified setState proxy to set sidecarSection
    useUnifiedChatStore.setState({ sidecarSection: 'files' });

    // Verify it was routed to the sidecar sub-store (useUIStore / useSidecarStore)
    const sidecarState = useUIStore.getState();
    expect(sidecarState.sidecarSection).toBe('files');

    // Also verify it's reflected through getState()
    const unified = useUnifiedChatStore.getState();
    expect(unified.sidecarSection).toBe('files');
  });

  it('should clear history', () => {
    const { addMessage, addFileOperation, clearHistory } = useUnifiedChatStore.getState();

    addMessage({ role: 'user', content: 'Test' });
    addFileOperation({
      id: 'op-1',
      type: 'read',
      filePath: '/test.txt',
      success: true,
    });

    let state = useUnifiedChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.fileOperations).toHaveLength(1);

    clearHistory();

    state = useUnifiedChatStore.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.fileOperations).toHaveLength(0);
  });

  it('should export conversation', async () => {
    const { addMessage, exportConversation } = useUnifiedChatStore.getState();

    addMessage({ role: 'user', content: 'Test message' });

    const exported = await exportConversation();
    const parsed = JSON.parse(exported);

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].content).toBe('Test message');
    expect(parsed.exportedAt).toBeDefined();
  });

  it('should attach action trail entries to the current streaming message when messageId is missing', () => {
    const { addMessage, setStreamingMessage, addActionTrailEntry } = useUnifiedChatStore.getState();

    addMessage({ role: 'assistant', content: 'Working...' });
    const streamingMessageId = useUnifiedChatStore.getState().messages[0]!.id;

    setStreamingMessage(streamingMessageId);
    addActionTrailEntry({
      type: 'running',
      message: 'Calling MCP tool',
      metadata: { source: 'test' },
    });

    const state = useUnifiedChatStore.getState();
    expect(state.actionTrail).toHaveLength(1);
    expect(state.actionTrail[0]?.metadata?.['messageId']).toBe(streamingMessageId);
  });

  it('should fall back to the latest assistant message for action trail ownership', () => {
    const { addMessage, addActionTrailEntry } = useUnifiedChatStore.getState();

    addMessage({ role: 'user', content: 'Do the task' });
    addMessage({ role: 'assistant', content: 'I am on it' });

    const assistantMessageId = useUnifiedChatStore.getState().messages[1]!.id;

    addActionTrailEntry({
      type: 'thinking',
      message: 'Analyzing repository state',
    });

    const state = useUnifiedChatStore.getState();
    expect(state.actionTrail).toHaveLength(1);
    expect(state.actionTrail[0]?.metadata?.['messageId']).toBe(assistantMessageId);
  });

  it('should resolve action ownership from the active conversation, not the global message list', () => {
    const activeAssistantId = 'conversation-assistant';
    const globalAssistantId = 'global-assistant';

    useUnifiedChatStore.setState({
      activeConversationId: 'conversation-1',
      messages: [
        {
          id: globalAssistantId,
          role: 'assistant',
          content: 'Global fallback',
          timestamp: new Date('2026-03-11T12:00:00.000Z'),
        },
      ],
      messagesByConversation: {
        'conversation-1': [
          {
            id: 'conversation-user',
            role: 'user',
            content: 'Do the work',
            timestamp: new Date('2026-03-11T12:00:00.000Z'),
          },
          {
            id: activeAssistantId,
            role: 'assistant',
            content: 'Working in the active conversation',
            timestamp: new Date('2026-03-11T12:00:01.000Z'),
          },
        ],
      },
    });

    useUnifiedChatStore.getState().addActionTrailEntry({
      type: 'running',
      message: 'Using filesystem.search',
    });

    const state = useUnifiedChatStore.getState();
    expect(state.actionTrail[0]?.metadata?.['messageId']).toBe(activeAssistantId);
    expect(state.actionTrail[0]?.metadata?.['messageId']).not.toBe(globalAssistantId);
  });

  it('should attach action log entries to the current streaming message when messageId is missing', () => {
    const { addMessage, setStreamingMessage, addActionLogEntry } = useUnifiedChatStore.getState();

    addMessage({ role: 'assistant', content: 'Working...' });
    const streamingMessageId = useUnifiedChatStore.getState().messages[0]!.id;

    setStreamingMessage(streamingMessageId);
    addActionLogEntry({
      id: 'action-log-1',
      type: 'mcp',
      title: 'Using MCP tool',
      status: 'running',
      metadata: { tool: 'filesystem.search' },
    });

    const state = useUnifiedChatStore.getState();
    expect(state.actionLog).toHaveLength(1);
    expect(state.actionLog[0]?.metadata?.['messageId']).toBe(streamingMessageId);
  });

  it('should preserve owned messageId when action log entries are updated', () => {
    const { addMessage, addActionLogEntry, updateActionLogEntry } = useUnifiedChatStore.getState();

    addMessage({ role: 'assistant', content: 'Working...' });
    const assistantMessageId = useUnifiedChatStore.getState().messages[0]!.id;

    addActionLogEntry({
      id: 'action-log-2',
      type: 'browser',
      title: 'Opened browser',
      status: 'running',
    });
    updateActionLogEntry('action-log-2', {
      status: 'success',
      description: 'Completed in 50ms',
      metadata: { durationMs: 50 },
    });

    const state = useUnifiedChatStore.getState();
    expect(state.actionLog[0]?.metadata?.['messageId']).toBe(assistantMessageId);
    expect(state.actionLog[0]?.metadata?.['durationMs']).toBe(50);
  });

  it('should attach approval requests to the current streaming message when messageId is missing', () => {
    const { addMessage, setStreamingMessage, addApprovalRequest } = useUnifiedChatStore.getState();

    addMessage({ role: 'assistant', content: 'Working...' });
    const streamingMessageId = useUnifiedChatStore.getState().messages[0]!.id;

    setStreamingMessage(streamingMessageId);
    addApprovalRequest({
      id: 'approval-1',
      type: 'mcp_tool',
      description: 'Run filesystem.search',
      riskLevel: 'medium',
      details: { toolName: 'filesystem.search' },
    });

    const state = useUnifiedChatStore.getState();
    expect(state.pendingApprovals).toHaveLength(1);
    expect(state.pendingApprovals[0]?.messageId).toBe(streamingMessageId);
    expect(state.pendingApprovals[0]?.details['messageId']).toBe(streamingMessageId);
  });
});
