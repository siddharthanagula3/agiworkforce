import { describe, expect, it, vi } from 'vitest';
import type { ToolLabelEntry } from '../../stores/chat/chatStore';
import type { ActionLogEntry, ApprovalRequest } from '../../stores/chat/toolStore';
import type { ActionTrailEntry } from '../../stores/chat/agentStore';
import {
  buildMessageRuntimeActivity,
  selectMessageActionLog,
  selectMessageApprovals,
  selectMessageThinking,
  selectMessageToolTimeline,
  selectUnassignedApprovals,
} from '../messageActivity';

const actionTrail: ActionTrailEntry[] = [
  {
    id: 'trail-1',
    type: 'thinking',
    message: 'Planning',
    timestamp: new Date('2026-03-12T00:00:00.000Z'),
    metadata: { messageId: 'assistant-1' },
  },
];

const actionLog: ActionLogEntry[] = [
  {
    id: 'log-1',
    type: 'mcp',
    title: 'filesystem.search',
    status: 'running',
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    updatedAt: new Date('2026-03-12T00:00:01.000Z'),
    metadata: { messageId: 'assistant-2' },
  },
  {
    id: 'log-2',
    type: 'terminal',
    title: 'npm test',
    status: 'success',
    createdAt: new Date('2026-03-12T00:01:00.000Z'),
    updatedAt: new Date('2026-03-12T00:01:01.000Z'),
    metadata: { messageId: 'assistant-1' },
  },
];

const pendingApprovals: ApprovalRequest[] = [
  {
    id: 'approval-1',
    type: 'terminal_command',
    description: 'Run npm install',
    riskLevel: 'medium',
    details: { messageId: 'assistant-1' },
    status: 'pending',
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
    messageId: 'assistant-1',
  },
  {
    id: 'approval-2',
    type: 'mcp_tool',
    description: 'Use github.search',
    riskLevel: 'high',
    details: {},
    status: 'pending',
    createdAt: new Date('2026-03-12T00:00:00.000Z'),
  },
];

const toolTimeline: ToolLabelEntry[] = [
  {
    id: 'tool-1',
    displayName: 'filesystem.search',
    displayArgs: 'query=todo',
    status: 'running',
  },
] as ToolLabelEntry[];

describe('messageActivity', () => {
  it('selects only message-owned runtime records', () => {
    const unifiedState = {
      actionLog,
      pendingApprovals,
      getActiveActionTrail: vi.fn(() => actionTrail),
    };

    expect(selectMessageActionLog(unifiedState, 'assistant-1').map((entry) => entry.id)).toEqual([
      'log-2',
    ]);
    expect(
      selectMessageApprovals(unifiedState, 'assistant-1').map((approval) => approval.id),
    ).toEqual(['approval-1']);
    expect(selectUnassignedApprovals(unifiedState).map((approval) => approval.id)).toEqual([
      'approval-2',
    ]);
  });

  it('builds one runtime snapshot for the transcript message', () => {
    const unifiedState = {
      actionLog,
      pendingApprovals,
      getActiveActionTrail: vi.fn(() => actionTrail),
    };
    const chatState = {
      toolTimelineByMessage: {
        'assistant-1': toolTimeline,
      },
      thinkingByMessage: {
        'assistant-1': 'Compare candidate tools',
      },
    };

    const activity = buildMessageRuntimeActivity(unifiedState, chatState, 'assistant-1');

    expect(activity.messageId).toBe('assistant-1');
    expect(activity.actionTrail).toEqual(actionTrail);
    expect(activity.actionLog.map((entry) => entry.id)).toEqual(['log-2']);
    expect(activity.approvals.map((approval) => approval.id)).toEqual(['approval-1']);
    expect(activity.toolTimeline).toEqual(toolTimeline);
    expect(activity.thinkingContent).toBe('Compare candidate tools');
  });

  it('returns stable empty runtime slices when the message has no activity', () => {
    const chatState = {
      toolTimelineByMessage: {},
      thinkingByMessage: {},
    };

    expect(selectMessageToolTimeline(chatState, 'missing')).toEqual([]);
    expect(selectMessageThinking(chatState, 'missing')).toBe('');
  });
});
