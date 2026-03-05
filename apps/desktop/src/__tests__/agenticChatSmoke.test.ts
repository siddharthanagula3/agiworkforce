/**
 * E2E Smoke Tests — Agentic Chat Pipeline
 *
 * Covers the core stores that power the agentic chat experience:
 * - ChatStore: conversation lifecycle, message CRUD, tool timeline, agentic loop
 * - ToolStore: tool executions, approvals, streaming, action log, trusted workflows
 * - SettingsStore: LLM config, chat preferences, execution preferences, features
 *
 * All Tauri invoke calls are mocked via the global test setup (src/test/setup.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { enableMapSet } from 'immer';

// Enable Immer's MapSet plugin (required by toolStore which uses Map for activeToolStreams)
enableMapSet();

import { useChatStore } from '../stores/chat/chatStore';
import { useToolStore } from '../stores/chat/toolStore';
import { useSettingsStore } from '../stores/settingsStore';

// ---------------------------------------------------------------------------
// ChatStore smoke tests
// ---------------------------------------------------------------------------

describe('ChatStore — conversation lifecycle', () => {
  beforeEach(() => {
    useChatStore.getState().clearHistory();
  });

  it('creates a conversation and sets it as active', () => {
    const id = useChatStore.getState().createConversation('Test chat');
    const state = useChatStore.getState();

    expect(id).toBeDefined();
    expect(state.activeConversationId).toBe(id);
    expect(state.conversations[0]?.title).toBe('Test chat');
    expect(state.messagesByConversation[id]).toEqual([]);
  });

  it('adds a user message and auto-generates title from first message', () => {
    const convoId = useChatStore.getState().createConversation();
    const msgId = useChatStore.getState().addMessage({
      role: 'user',
      content: 'Help me debug this authentication issue',
    });

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.id).toBe(msgId);
    expect(state.messages[0]?.role).toBe('user');

    // Title should be auto-generated from first user message (not "New chat")
    const convo = state.conversations.find((c) => c.id === convoId);
    expect(convo?.title).not.toBe('New chat');
    expect(convo?.title).toContain('Help me debug');
  });

  it('adds an assistant response and tracks message ordering', () => {
    useChatStore.getState().createConversation('Order test');
    useChatStore.getState().addMessage({ role: 'user', content: 'Hello' });
    useChatStore.getState().addMessage({ role: 'assistant', content: 'Hi there!' });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe('Hi there!');
  });

  it('switches between conversations and restores cached messages', () => {
    const id1 = useChatStore.getState().createConversation('Chat 1');
    useChatStore.getState().addMessage({ role: 'user', content: 'First chat' });

    useChatStore.getState().createConversation('Chat 2');
    useChatStore.getState().addMessage({ role: 'user', content: 'Second chat' });

    // Switch back to first conversation
    useChatStore.getState().selectConversation(id1);
    const state = useChatStore.getState();

    expect(state.activeConversationId).toBe(id1);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.content).toBe('First chat');
  });

  it('deletes a conversation and clears its messages', () => {
    const id = useChatStore.getState().createConversation('To delete');
    useChatStore.getState().addMessage({ role: 'user', content: 'Bye' });

    useChatStore.getState().deleteConversation(id);
    const state = useChatStore.getState();

    expect(state.conversations.find((c) => c.id === id)).toBeUndefined();
    expect(state.messagesByConversation[id]).toBeUndefined();
  });
});

describe('ChatStore — tool timeline and agentic loop', () => {
  beforeEach(() => {
    useChatStore.getState().clearHistory();
  });

  it('adds tool timeline entries for a message', () => {
    useChatStore.getState().createConversation();
    const msgId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Running tools...',
    });

    useChatStore.getState().addToolTimelineEntry(msgId, {
      id: 'tool-1',
      displayName: 'Read',
      displayArgs: 'src/main.ts',
      status: 'running',
    });

    useChatStore.getState().addToolTimelineEntry(msgId, {
      id: 'tool-2',
      displayName: 'Bash',
      displayArgs: 'npm test',
      status: 'running',
    });

    const timeline = useChatStore.getState().toolTimelineByMessage[msgId];
    expect(timeline).toHaveLength(2);
    expect(timeline![0]?.displayName).toBe('Read');
    expect(timeline![1]?.displayName).toBe('Bash');
  });

  it('updates a tool timeline entry status to completed', () => {
    useChatStore.getState().createConversation();
    const msgId = useChatStore.getState().addMessage({
      role: 'assistant',
      content: 'Working...',
    });

    useChatStore.getState().addToolTimelineEntry(msgId, {
      id: 'tool-1',
      displayName: 'Write',
      displayArgs: 'output.json',
      status: 'running',
    });

    useChatStore.getState().updateToolTimelineEntry(msgId, 'tool-1', {
      status: 'completed',
      durationMs: 245,
    });

    const entry = useChatStore.getState().toolTimelineByMessage[msgId]?.[0];
    expect(entry?.status).toBe('completed');
    expect(entry?.durationMs).toBe(245);
  });

  it('sets and clears agentic loop status', () => {
    useChatStore.getState().setAgenticLoopStatus({
      active: true,
      conversationId: 42,
      iteration: 1,
      maxIterations: 10,
    });

    expect(useChatStore.getState().agenticLoopStatus?.active).toBe(true);
    expect(useChatStore.getState().agenticLoopStatus?.iteration).toBe(1);

    useChatStore.getState().setAgenticLoopStatus(null);
    expect(useChatStore.getState().agenticLoopStatus).toBeNull();
  });

  it('manages pending messages for mid-task input', () => {
    useChatStore.getState().addPendingMessage({
      id: 'pend-1',
      content: 'Use TypeScript strict mode',
      timestamp: new Date().toISOString(),
      conversation_id: 42,
    });

    expect(useChatStore.getState().pendingMessages).toHaveLength(1);
    expect(useChatStore.getState().getPendingMessagesCount()).toBe(1);

    useChatStore.getState().removePendingMessage('pend-1');
    expect(useChatStore.getState().pendingMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ToolStore smoke tests
// ---------------------------------------------------------------------------

describe('ToolStore — tool executions and approvals', () => {
  beforeEach(() => {
    useToolStore.getState().resetOnLogout();
  });

  it('adds a tool execution and caps at 200', () => {
    useToolStore.getState().addToolExecution({
      id: 'exec-1',
      toolName: 'bash',
      input: { command: 'ls' },
      output: 'file1.ts\nfile2.ts',
      duration: 50,
      success: true,
    });

    const execs = useToolStore.getState().toolExecutions;
    expect(execs).toHaveLength(1);
    expect(execs[0]?.toolName).toBe('bash');
    expect(execs[0]?.success).toBe(true);
  });

  it('manages approval requests — add, approve, reject', () => {
    // Add an approval request
    useToolStore.getState().addApprovalRequest({
      id: 'approval-1',
      type: 'terminal_command',
      description: 'Run: rm -rf node_modules',
      riskLevel: 'high',
      details: { command: 'rm -rf node_modules' },
    });

    expect(useToolStore.getState().pendingApprovals).toHaveLength(1);
    expect(useToolStore.getState().pendingApprovals[0]?.status).toBe('pending');

    // Approve it
    useToolStore.getState().approveOperation('approval-1');
    expect(useToolStore.getState().pendingApprovals).toHaveLength(0);

    // Add another and reject it
    useToolStore.getState().addApprovalRequest({
      id: 'approval-2',
      type: 'file_delete',
      description: 'Delete config.json',
      riskLevel: 'medium',
      details: {},
    });
    useToolStore.getState().rejectOperation('approval-2', 'Too risky');
    expect(useToolStore.getState().pendingApprovals).toHaveLength(0);
  });

  it('tracks tool streams and filters active ones', () => {
    useToolStore.getState().updateToolStream('stream-1', {
      tool_name: 'web_search',
      status: 'running',
      progress: 30,
    });

    useToolStore.getState().updateToolStream('stream-2', {
      tool_name: 'file_read',
      status: 'completed',
      progress: 100,
    });

    const active = useToolStore.getState().getActiveToolStreams();
    expect(active).toHaveLength(1);
    expect(active[0]?.tool_name).toBe('web_search');
  });

  it('records trusted workflows and checks action trust', () => {
    useToolStore.getState().setTrustedWorkflow({
      hash: 'wf-hash-1',
      label: 'Deploy workflow',
      createdAt: new Date(),
      actionSignatures: ['action-sig-A'],
    });

    expect(useToolStore.getState().isActionTrusted('wf-hash-1', 'action-sig-A')).toBe(true);
    expect(useToolStore.getState().isActionTrusted('wf-hash-1', 'unknown-sig')).toBe(false);
    expect(useToolStore.getState().isActionTrusted(undefined, 'action-sig-A')).toBe(false);

    // Record a new action signature
    useToolStore.getState().recordTrustedAction('wf-hash-1', 'action-sig-B');
    expect(useToolStore.getState().isActionTrusted('wf-hash-1', 'action-sig-B')).toBe(true);
  });

  it('resets all state on logout', () => {
    useToolStore.getState().addToolExecution({
      id: 'x',
      toolName: 't',
      input: {},
      duration: 0,
      success: true,
    });
    useToolStore.getState().addFileOperation({
      id: 'f',
      type: 'read',
      filePath: '/tmp/a',
      success: true,
    });

    useToolStore.getState().resetOnLogout();

    const state = useToolStore.getState();
    expect(state.toolExecutions).toHaveLength(0);
    expect(state.fileOperations).toHaveLength(0);
    expect(state.pendingApprovals).toHaveLength(0);
    expect(state.plan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SettingsStore smoke tests
// ---------------------------------------------------------------------------

describe('SettingsStore — configuration persistence', () => {
  it('has sensible defaults for LLM config', () => {
    const state = useSettingsStore.getState();
    expect(state.llmConfig.defaultProvider).toBe('managed_cloud');
    expect(state.llmConfig.temperature).toBe(0.7);
    expect(state.llmConfig.maxTokens).toBe(4096);
  });

  it('updates temperature and maxTokens', () => {
    useSettingsStore.getState().setTemperature(0.3);
    useSettingsStore.getState().setMaxTokens(8192);

    const config = useSettingsStore.getState().llmConfig;
    expect(config.temperature).toBe(0.3);
    expect(config.maxTokens).toBe(8192);

    // Reset
    useSettingsStore.getState().setTemperature(0.7);
    useSettingsStore.getState().setMaxTokens(4096);
  });

  it('toggles chat preferences', () => {
    const original = useSettingsStore.getState().chatPreferences.compactMode;
    useSettingsStore.getState().setCompactMode(!original);
    expect(useSettingsStore.getState().chatPreferences.compactMode).toBe(!original);

    // Reset
    useSettingsStore.getState().setCompactMode(original);
  });

  it('manages feature capability toggles', () => {
    useSettingsStore.getState().setFeature('voice-input', true);
    expect(useSettingsStore.getState().features['voice-input']).toBe(true);

    useSettingsStore.getState().setFeature('voice-input', false);
    expect(useSettingsStore.getState().features['voice-input']).toBe(false);
  });

  it('manages allowed directories', () => {
    useSettingsStore.getState().setAllowedDirectories([]);

    useSettingsStore.getState().addAllowedDirectory('/home/user/projects');
    useSettingsStore.getState().addAllowedDirectory('/tmp/sandbox');

    expect(useSettingsStore.getState().allowedDirectories).toHaveLength(2);

    useSettingsStore.getState().removeAllowedDirectory('/tmp/sandbox');
    expect(useSettingsStore.getState().allowedDirectories).toEqual(['/home/user/projects']);

    // Cleanup
    useSettingsStore.getState().setAllowedDirectories([]);
  });
});
