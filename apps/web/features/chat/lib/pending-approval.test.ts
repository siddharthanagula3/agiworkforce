import { describe, expect, it } from 'vitest';
import type { Message, MessageToolEntry } from '@shared/stores/web-chat-store';
import {
  countPendingApprovals,
  hasPendingApproval,
  hasPendingMessageApproval,
} from './pending-approval';

type Projection = NonNullable<NonNullable<Message['metadata']>['cloudApproval']>;

const pendingTool: MessageToolEntry = {
  name: 'file_read',
  status: 'awaiting_approval',
  requiresApproval: true,
  toolCallId: 'call-read',
};

function assistantMessage(metadata?: Message['metadata']): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Here is what I found so far.',
    createdAt: '2026-11-07T12:00:00.000Z',
    metadata,
  };
}

function projection(calls: Projection['calls']): Projection {
  return {
    schemaVersion: 1,
    runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
    calls,
  };
}

describe('pending approval presentation', () => {
  it('recognizes a projection-only pending message without tool cards', () => {
    const message = assistantMessage({
      cloudApproval: projection([{ toolCallId: 'call-read', name: 'file_read' }]),
    });

    expect(hasPendingMessageApproval(message)).toBe(true);
    expect(hasPendingApproval([message])).toBe(true);
    expect(countPendingApprovals({ displayed: [message] })).toBe(1);
  });

  it('keeps partially decided projections pending and counts only unresolved calls', () => {
    const message = assistantMessage({
      cloudApproval: projection([
        { toolCallId: 'call-read', name: 'file_read', approvalDecision: 'approved' },
        { toolCallId: 'call-write', name: 'file_write', approvalDecision: 'rejected' },
        { toolCallId: 'call-shell', name: 'shell_command' },
      ]),
    });

    expect(hasPendingMessageApproval(message)).toBe(true);
    expect(countPendingApprovals({ displayed: [message] })).toBe(1);
  });

  it('honors fully decided projections over stale awaiting tool metadata', () => {
    const message = assistantMessage({
      cloudApproval: projection([
        { toolCallId: 'call-read', name: 'file_read', approvalDecision: 'approved' },
        { toolCallId: 'call-write', name: 'file_write', approvalDecision: 'rejected' },
      ]),
      tools: [pendingTool],
    });

    expect(hasPendingMessageApproval(message)).toBe(false);
    expect(hasPendingApproval([message])).toBe(false);
    expect(countPendingApprovals({ displayed: [message] })).toBe(0);
  });

  it('falls back to legacy tools only when the projection is absent', () => {
    const message = assistantMessage({
      cloudApproval: null,
      tools: [pendingTool],
    });

    expect(hasPendingMessageApproval(message)).toBe(true);
    for (const tool of [
      { ...pendingTool, approved: true },
      { ...pendingTool, approved: false },
      { ...pendingTool, requiresApproval: false },
      { ...pendingTool, toolCallId: undefined },
      { ...pendingTool, status: 'completed' as const },
    ]) {
      expect(hasPendingMessageApproval(assistantMessage({ tools: [tool] }))).toBe(false);
    }
    expect(hasPendingMessageApproval(assistantMessage())).toBe(false);
  });

  it('excludes user messages even when they contain projection or legacy metadata', () => {
    const userMessage: Message = {
      ...assistantMessage({
        cloudApproval: projection([{ toolCallId: 'call-read', name: 'file_read' }]),
        tools: [pendingTool],
      }),
      role: 'user',
    };

    expect(hasPendingMessageApproval(userMessage)).toBe(false);
    expect(hasPendingApproval([userMessage])).toBe(false);
    expect(countPendingApprovals({ displayed: [userMessage] })).toBe(0);
  });

  it('keeps displayed-conversation pending state separate from background requests', () => {
    const pendingConversation = [assistantMessage({ tools: [pendingTool] })];
    const finishedConversation = [assistantMessage()];

    expect(hasPendingApproval(pendingConversation)).toBe(true);
    expect(hasPendingApproval(finishedConversation)).toBe(false);
    expect(hasPendingApproval([])).toBe(false);
    expect(
      countPendingApprovals({
        background: pendingConversation,
        displayed: finishedConversation,
      }),
    ).toBe(1);
  });
});
