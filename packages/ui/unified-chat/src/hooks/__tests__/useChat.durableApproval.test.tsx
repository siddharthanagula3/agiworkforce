import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';

const RUN_ID = '0190a000-0000-7000-8000-000000000099';
const APPROVAL_MODEL_FIXTURE = 'fixture-approval-model';

function makeRuntime() {
  let callback: StreamCallback | null = null;
  const runtime: ChatRuntime = {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    resolveToolApproval: vi.fn(async () => {}),
    hasLiveApprovalTurn: vi.fn(() => true),
    onStream: (next) => {
      callback = next;
      return () => {
        callback = null;
      };
    },
  };
  return {
    runtime,
    emit(event: Parameters<StreamCallback>[0]) {
      if (!callback) throw new Error('stream callback unavailable');
      act(() => callback!(event));
    },
  };
}

beforeEach(() => {
  useChatStore.setState({
    activeConversationId: 'conv-1',
    messagesByConversation: { 'conv-1': [] },
    isStreaming: false,
  } as never);
});

describe('useChat durable tool approval projection', () => {
  it('passes a persisted run projection to a fresh runtime', async () => {
    const { runtime } = makeRuntime();
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: {
        'conv-1': [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Before approval.',
            model: APPROVAL_MODEL_FIXTURE,
            metadata: {
              cloudAgentRun: {
                runId: RUN_ID,
                runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
                lastSequence: 3,
                state: 'awaiting_input',
              },
            },
            toolCalls: [
              {
                id: 'call_1',
                name: 'read_file',
                args: { path: '/README.md' },
                status: 'awaiting_approval',
                requiresApproval: true,
                approvalDecision: 'approved',
              },
            ],
          },
        ],
      },
    } as never);

    renderHook(() => useChat(runtime));

    await waitFor(() =>
      expect(runtime.hasLiveApprovalTurn).toHaveBeenCalledWith('conv-1', {
        assistantMessageId: 'assistant-1',
        runId: RUN_ID,
        runReference: {
          runId: RUN_ID,
          runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
          lastSequence: 3,
          state: 'awaiting_input',
        },
        model: APPROVAL_MODEL_FIXTURE,
        assistantContent: 'Before approval.',
        calls: [
          {
            toolCallId: 'call_1',
            name: 'read_file',
            args: { path: '/README.md' },
            decision: 'approved',
          },
        ],
        messageProjection: {
          toolCalls: [
            {
              id: 'call_1',
              name: 'read_file',
              args: { path: '/README.md' },
              status: 'awaiting_approval',
              requiresApproval: true,
              approvalDecision: 'approved',
            },
          ],
        },
      }),
    );
  });

  it('keeps partial decisions awaiting approval until every call is decided', async () => {
    const { runtime, emit } = makeRuntime();
    const { result } = renderHook(() => useChat(runtime));

    emit({ type: 'agent_run', runId: RUN_ID, runPath: `/api/runs/${RUN_ID}` });
    emit({ type: 'tool_approval_request', toolCallId: 'call_1', name: 'read_file', args: {} });
    emit({ type: 'tool_approval_request', toolCallId: 'call_2', name: 'write_file', args: {} });

    const assistant = useChatStore.getState().messagesByConversation['conv-1']?.[0];
    act(() => result.current.resolveToolApproval(assistant!.id, 'call_1', 'approved'));

    const decided = useChatStore
      .getState()
      .messagesByConversation['conv-1']?.[0]?.toolCalls?.find((call) => call.id === 'call_1');
    expect(decided).toMatchObject({
      status: 'awaiting_approval',
      requiresApproval: true,
      approvalDecision: 'approved',
    });
  });
});
