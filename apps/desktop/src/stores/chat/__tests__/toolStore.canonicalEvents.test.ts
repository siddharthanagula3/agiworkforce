import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useAgentStore } from '../agentStore';
import { useChatStore } from '../chatStore';
import { useToolStore, applyCanonicalToolEvent, type ToolEventPayload } from '../toolStore';

enableMapSet();

function buildRunningAgent() {
  return {
    id: 'agent-1',
    name: 'Primary Agent',
    status: 'running' as const,
    progress: 0,
    currentStep: 'Thinking',
  };
}

function createAssistantMessage(): string {
  useChatStore.getState().createConversation('Canonical tool events');
  return useChatStore.getState().addMessage({
    role: 'assistant',
    content: 'Working...',
    metadata: {
      streaming: true,
      status: 'running',
    },
  });
}

describe('applyCanonicalToolEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().resetOnLogout();
    useAgentStore.getState().resetOnLogout();
    useToolStore.getState().resetOnLogout();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useChatStore.getState().resetOnLogout();
    useAgentStore.getState().resetOnLogout();
    useToolStore.getState().resetOnLogout();
  });

  it('applies started events to tool stream, timeline, and message metadata', () => {
    const messageId = createAssistantMessage();

    const payload: ToolEventPayload = {
      type: 'started',
      id: 'tool-start-1',
      conversation_id: 42,
      message_id: messageId,
      tool_name: 'browser_navigate',
      display_name: 'Browser Navigate',
      display_args: 'https://example.com',
      iteration: 2,
    };

    applyCanonicalToolEvent(payload);

    const chatState = useChatStore.getState();
    const toolState = useToolStore.getState();
    const agentState = useAgentStore.getState();

    const message = chatState.messages.find((entry) => entry.id === messageId);
    const timelineEntry = chatState.toolTimelineByMessage[messageId]?.[0];
    const activeTool = toolState.activeToolStreams.get(payload.id);
    const actionTrailEntry = agentState.actionTrail[0];

    expect(message?.metadata?.tool).toBe('Browser Navigate');
    expect(message?.metadata?.toolCall).toBe(payload.id);
    expect(message?.metadata?.status).toBe('running');
    expect(message?.metadata?.streaming).toBe(true);

    expect(timelineEntry?.id).toBe(payload.id);
    expect(timelineEntry?.displayName).toBe('Browser Navigate');
    expect(timelineEntry?.displayArgs).toBe('https://example.com');
    expect(timelineEntry?.status).toBe('running');

    expect(activeTool?.tool_name).toBe('Browser Navigate');
    expect(activeTool?.status).toBe('running');
    expect(activeTool?.parameters?.['displayArgs']).toBe('https://example.com');

    expect(actionTrailEntry?.type).toBe('running');
    expect(actionTrailEntry?.message).toBe('Browser Navigate: https://example.com');
    expect(actionTrailEntry?.metadata?.['toolEventId']).toBe(payload.id);
  });

  it('applies completed events to terminal state and agent step text', () => {
    const messageId = createAssistantMessage();
    useAgentStore.getState().setAgentStatus(buildRunningAgent());

    applyCanonicalToolEvent({
      type: 'started',
      id: 'tool-complete-1',
      conversation_id: 42,
      message_id: messageId,
      tool_name: 'browser_navigate',
      display_name: 'Browser Navigate',
      display_args: 'https://example.com',
    });

    applyCanonicalToolEvent({
      type: 'completed',
      id: 'tool-complete-1',
      conversation_id: 42,
      message_id: messageId,
      tool_name: 'browser_navigate',
      display_name: 'Browser Navigate',
      success: true,
      duration_ms: 321,
      result_preview: 'Navigation completed',
    });

    const chatState = useChatStore.getState();
    const toolState = useToolStore.getState();
    const agentState = useAgentStore.getState();

    const message = chatState.messages.find((entry) => entry.id === messageId);
    const timelineEntry = chatState.toolTimelineByMessage[messageId]?.find(
      (entry) => entry.id === 'tool-complete-1',
    );
    const toolStream = toolState.activeToolStreams.get('tool-complete-1');
    const completionEntry = agentState.actionTrail[agentState.actionTrail.length - 1];

    expect(message?.metadata?.status).toBe('completed');
    expect(message?.metadata?.streaming).toBe(false);

    expect(timelineEntry?.status).toBe('completed');
    expect(timelineEntry?.durationMs).toBe(321);
    expect(timelineEntry?.resultPreview).toBe('Navigation completed');

    expect(toolStream?.status).toBe('completed');
    expect(toolStream?.duration_ms).toBe(321);
    expect(toolStream?.result).toBe('Navigation completed');

    expect(completionEntry?.type).toBe('completed');
    expect(completionEntry?.message).toBe('Browser Navigate completed (321ms)');
    expect(agentState.agentStatus?.currentStep).toBe('Completed Browser Navigate');

    vi.advanceTimersByTime(5000);
    expect(useToolStore.getState().activeToolStreams.has('tool-complete-1')).toBe(false);
  });
});
