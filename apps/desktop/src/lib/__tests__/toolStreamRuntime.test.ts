import { describe, expect, it, vi } from 'vitest';
import type { EnhancedMessage } from '../../stores/chat/types';
import type { ActionTrailEntry } from '../../stores/chat/agentStore';
import type { Artifact } from '../../types/chat';
import {
  buildOutputChunkToolStreamUpdate,
  buildProgressToolStreamUpdate,
  buildStartedToolStreamUpdate,
  buildTerminalToolStreamUpdate,
  clearRunningToolTrailEntries,
  normalizeToolTerminalArtifactStatus,
  reconcileToolArtifactTerminalState,
} from '../toolStreamRuntime';

const createMessage = (overrides: Partial<EnhancedMessage> = {}): EnhancedMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  content: 'Working...',
  timestamp: new Date('2026-03-12T00:00:00.000Z'),
  ...overrides,
});

describe('toolStreamRuntime', () => {
  it('normalizes tool stream terminal statuses for artifact reconciliation', () => {
    expect(normalizeToolTerminalArtifactStatus('running')).toBe('completed');
    expect(normalizeToolTerminalArtifactStatus('error')).toBe('failed');
    expect(normalizeToolTerminalArtifactStatus('cancelled')).toBe('cancelled');
  });

  it('builds canonical tool stream state updates for each lifecycle stage', () => {
    expect(
      buildStartedToolStreamUpdate({
        toolId: 'tool-1',
        toolName: 'filesystem.search',
        timestamp: '2026-03-12T00:00:00.000Z',
        parameters: { query: 'foo' },
      }),
    ).toEqual({
      tool_id: 'tool-1',
      tool_name: 'filesystem.search',
      status: 'running',
      progress: 0,
      startedAt: new Date('2026-03-12T00:00:00.000Z'),
      parameters: { query: 'foo' },
    });

    expect(
      buildProgressToolStreamUpdate({
        progress: 0.5,
        message: 'Halfway there',
        bytesProcessed: 50,
        bytesTotal: 100,
      }),
    ).toEqual({
      progress: 0.5,
      progressMessage: 'Halfway there',
      bytesProcessed: 50,
      bytesTotal: 100,
    });

    expect(buildOutputChunkToolStreamUpdate('chunk-1')).toEqual({
      outputBuffer: 'chunk-1',
      outputChunks: ['chunk-1'],
    });

    expect(
      buildTerminalToolStreamUpdate({
        status: 'completed',
        timestamp: '2026-03-12T00:00:05.000Z',
        durationMs: 5000,
        result: { ok: true },
      }),
    ).toEqual({
      status: 'completed',
      progress: 1,
      result: { ok: true },
      error: undefined,
      completedAt: new Date('2026-03-12T00:00:05.000Z'),
      duration_ms: 5000,
      retryable: undefined,
    });

    expect(
      buildTerminalToolStreamUpdate({
        status: 'error',
        timestamp: '2026-03-12T00:00:06.000Z',
        durationMs: 6000,
        error: 'boom',
        retryable: true,
      }),
    ).toEqual({
      status: 'error',
      progress: undefined,
      result: undefined,
      error: 'boom',
      completedAt: new Date('2026-03-12T00:00:06.000Z'),
      duration_ms: 6000,
      retryable: true,
    });
  });

  it('clears running tool trail entries by tool id and legacy message text', () => {
    const removeActionTrailEntry = vi.fn();
    const state = {
      actionTrail: [
        {
          id: 'run-1',
          type: 'running',
          message: 'Calling filesystem.search...',
          timestamp: new Date('2026-03-12T00:00:00.000Z'),
          metadata: { tool_call_id: 'tool-1' },
        },
        {
          id: 'run-2',
          type: 'running',
          message: 'Executing filesystem.search...',
          timestamp: new Date('2026-03-12T00:00:01.000Z'),
        },
        {
          id: 'done-1',
          type: 'completed',
          message: 'filesystem.search completed',
          timestamp: new Date('2026-03-12T00:00:02.000Z'),
        },
      ] as ActionTrailEntry[],
      removeActionTrailEntry,
    };

    const removedIds = clearRunningToolTrailEntries(state, 'tool-1', 'filesystem.search');

    expect(removedIds).toEqual(['run-1', 'run-2']);
    expect(removeActionTrailEntry).toHaveBeenCalledTimes(2);
    expect(removeActionTrailEntry).toHaveBeenCalledWith('run-1');
    expect(removeActionTrailEntry).toHaveBeenCalledWith('run-2');
  });

  it('reconciles tool-owned artifact terminal state back onto the owning message', () => {
    const updateMessage = vi.fn();
    const state = {
      activeConversationId: 'conversation-1',
      messages: [
        createMessage({
          artifacts: [
            {
              id: 'tool-1',
              type: 'code',
              title: 'Search',
              content: '',
              status: 'running',
            } as Artifact & { status: string },
          ],
        }),
      ],
      messagesByConversation: {},
      updateMessage,
    };

    const messageId = reconcileToolArtifactTerminalState(state, 'tool-1', {
      status: 'cancelled',
      reason: 'Cancelled by user',
      completedAt: '2026-03-12T00:01:00.000Z',
      durationMs: 1200,
      messageState: {
        status: 'cancelled',
        streaming: false,
      },
    });

    expect(messageId).toBe('assistant-1');
    expect(updateMessage).toHaveBeenCalledTimes(1);
    expect(updateMessage).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          status: 'cancelled',
          streaming: false,
        }),
        artifacts: [
          expect.objectContaining({
            id: 'tool-1',
            status: 'cancelled',
            success: false,
            error: 'Cancelled by user',
          }),
        ],
      }),
    );
  });
});
