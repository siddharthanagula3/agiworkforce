import { describe, expect, it } from 'vitest';
import {
  applyCanonicalAgentEvent,
  applyStreamFailure,
  hydrateStoredChatMessage,
  projectCanonicalAgentActivity,
  resolveComposerPrompt,
  selectModelHistory,
  shouldRebuildMessageDom,
  shouldRenderTextBubble,
  trimChatMessages,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

function message(index: number, role: 'user' | 'assistant' = 'user'): SidePanelChatMessage {
  return {
    id: `message-${index}`,
    role,
    content: `content-${index}`,
    timestamp: index,
  };
}

describe('side-panel chat state', () => {
  it('projects canonical activity while excluding private reasoning from the visible log', () => {
    const messages = [message(1)];
    const base = {
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      emittedAtMs: 1_000,
    } as const;

    applyCanonicalAgentEvent(messages, 'stream-1', {
      ...base,
      sequence: 0,
      event: {
        type: 'progress-update',
        progressId: 'research',
        summary: 'Searching official sources',
        status: 'running',
      },
    });
    applyCanonicalAgentEvent(messages, 'stream-1', {
      ...base,
      sequence: 1,
      event: { type: 'reasoning-delta', delta: 'private provider scratchpad' },
    });

    const assistant = messages.find((entry) => entry.id === 'stream-1');
    expect(assistant?.agentActivity).toMatchObject({
      lastSequence: 1,
      status: 'running',
      entries: [expect.objectContaining({ summary: 'Searching official sources' })],
    });
    expect(JSON.stringify(assistant?.agentActivity)).not.toContain('private provider scratchpad');
    expect(JSON.stringify(assistant?.agentEvents)).not.toContain('private provider scratchpad');
    expect(assistant?.agentEvents).toHaveLength(1);
  });

  it('deduplicates replayed tool events by their canonical sequence', () => {
    const messages: SidePanelChatMessage[] = [
      { ...message(1, 'assistant'), id: 'stream-1', content: '' },
    ];
    const envelope = {
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1_000,
      event: {
        type: 'tool-execution-start',
        toolCallId: 'search-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'official release notes' },
      },
    } as const;

    applyCanonicalAgentEvent(messages, 'stream-1', envelope);
    applyCanonicalAgentEvent(messages, 'stream-1', envelope);

    expect(messages[0]?.agentActivity?.entries).toHaveLength(1);
    expect(messages[0]?.agentEvents).toHaveLength(1);
  });

  it('rebuilds the same safe inline activity from persisted canonical display events', () => {
    const messages: SidePanelChatMessage[] = [];
    const envelope = {
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      sequence: 4,
      emittedAtMs: 1_000,
      event: {
        type: 'artifact-produced',
        artifactId: 'artifact-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        uri: '/api/files/report.pdf',
      },
    } as const;

    const assistant = applyCanonicalAgentEvent(messages, 'stream-1', envelope);

    expect(projectCanonicalAgentActivity(assistant.agentEvents)).toEqual(assistant.agentActivity);
  });

  it('faithfully hydrates durable activity, run, and approval metadata from history', () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const event = {
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      sequence: 2,
      emittedAtMs: 1_000,
      event: {
        type: 'progress-update',
        progressId: 'history-restore',
        summary: 'Restoring durable work',
        status: 'running',
      },
    } as const;

    const hydrated = hydrateStoredChatMessage(
      {
        role: 'assistant',
        content: 'Partial durable answer',
        timestamp: 1_001,
        agentEvents: [event],
        cloudAgentRun: {
          runId,
          runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
          lastSequence: 2,
          state: 'running',
        },
        cloudApprovalDecisions: { 'tool-1': 'approved' },
        cloudApprovalError: 'Continuation interrupted.',
        managedQuickMode: true,
      },
      'history-message-1',
    );

    expect(hydrated).toMatchObject({
      id: 'history-message-1',
      agentActivity: { lastSequence: 2, status: 'running' },
      cloudAgentRun: { runId, lastSequence: 2 },
      cloudApprovalDecisions: { 'tool-1': 'approved' },
      cloudApprovalError: 'Continuation interrupted.',
      managedQuickMode: true,
    });
    expect(hydrated.agentEvents).toEqual([event]);
  });

  it('creates a visible prompt for attachment-only turns', () => {
    expect(resolveComposerPrompt('', 1)).toBe('Please analyze the attached image.');
    expect(resolveComposerPrompt('   ', 2)).toBe('Please analyze the attached images.');
  });

  it('does not create an empty turn when there is no text or attachment', () => {
    expect(resolveComposerPrompt('   ', 0)).toBeNull();
  });

  it('preserves the user prompt when attachments are present', () => {
    expect(resolveComposerPrompt('  Compare these screenshots  ', 2)).toBe(
      'Compare these screenshots',
    );
  });

  it('turns a partial assistant stream into one terminal error instead of duplicating its id', () => {
    const messages = [
      message(1),
      { ...message(2, 'assistant'), id: 'stream-1', content: 'partial', streaming: true },
    ];

    applyStreamFailure(messages, 'stream-1', 'network lost', 3);

    expect(messages.filter((entry) => entry.id === 'stream-1')).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({
      // The partial answer survives untouched; the failure is recorded beside
      // it rather than appended into it as "Error: <provider string>", which
      // rendered a provider message as assistant prose.
      content: 'partial',
      errorText: 'network lost',
      streaming: false,
      error: true,
    });
    expect(messages.at(-1)?.content).not.toContain('Error:');
  });

  it('creates a terminal error when no assistant stream was rendered yet', () => {
    const messages = [message(1)];

    applyStreamFailure(messages, 'stream-2', 'request rejected', 2);

    expect(messages.at(-1)).toMatchObject({
      id: 'stream-2',
      role: 'assistant',
      content: '',
      errorText: 'request rejected',
      error: true,
    });
    expect(messages.at(-1)?.content).not.toContain('Error:');
  });

  it('bounds the live conversation to the newest messages', () => {
    const messages = Array.from({ length: 55 }, (_, index) => message(index));

    expect(trimChatMessages(messages, 50)).toBe(5);
    expect(messages).toHaveLength(50);
    expect(messages[0]?.id).toBe('message-5');
    expect(messages.at(-1)?.id).toBe('message-54');
  });

  it('keeps UI failures and the current user turn out of model history', () => {
    const messages: SidePanelChatMessage[] = [
      message(1),
      { ...message(2, 'assistant'), error: true },
      message(3),
    ];

    expect(selectModelHistory(messages, 'message-3')).toEqual([
      { role: 'user', content: 'content-1' },
    ]);
  });

  it('forces a DOM rebuild after trimming even when retained length is unchanged', () => {
    expect(
      shouldRebuildMessageDom({ forceRebuild: true, renderedCount: 50, messageCount: 50 }),
    ).toBe(true);
    expect(
      shouldRebuildMessageDom({ forceRebuild: false, renderedCount: 50, messageCount: 51 }),
    ).toBe(false);
  });

  describe('shouldRenderTextBubble', () => {
    it('renders a bubble for a completed message that has text', () => {
      expect(shouldRenderTextBubble({ text: 'the answer', streaming: false })).toBe(true);
    });

    it('renders a bubble for a still-streaming message even when its text is empty', () => {
      // Regression: an agentic run creates the assistant message from a
      // tool/agent event with empty content but streaming:true, then streams the
      // answer in. The bubble MUST exist up-front so the in-place streaming
      // updater has an `sp-bubble-<id>` target — otherwise the reply never paints.
      expect(shouldRenderTextBubble({ text: '', streaming: true })).toBe(true);
      expect(shouldRenderTextBubble({ text: '   ', streaming: true })).toBe(true);
    });

    it('does not render a bubble for a completed message with no text (tool-activity-only)', () => {
      expect(shouldRenderTextBubble({ text: '', streaming: false })).toBe(false);
      expect(shouldRenderTextBubble({ text: '   \n ', streaming: false })).toBe(false);
    });
  });
});
