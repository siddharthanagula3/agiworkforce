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
});
