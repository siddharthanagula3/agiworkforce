import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';

vi.mock('@agiworkforce/api', () => ({
  agent: {
    agentSetWorkflowHash: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useAgentStore } from '../agentStore';
import { useChatStore } from '../chatStore';
import { useToolStore } from '../toolStore';
import {
  applyApprovalDenied,
  applyApprovalRequest,
  applyAgentActionUpdate,
  applyAgentPermissionRequired,
  applyAgentPlanUpdate,
  applyAgentStepStarted,
  applyAgentTaskFailed,
  applyBackgroundAgentCompleted,
  applyGoalAchieved,
  applyGoalProgress,
  applyGoalStepCompleted,
  applyToolConfirmationRequired,
  applyToolConfirmationTimeout,
} from '../agentWorkflowEvents';
import { sha256 } from '../../../lib/hash';

enableMapSet();

function createAssistantMessage(): string {
  const messageId = 'assistant-message-1';
  useChatStore.setState({
    activeConversationId: 'conversation-1',
    messages: [
      {
        id: messageId,
        role: 'assistant',
        content: 'Working...',
        timestamp: new Date('2026-04-06T10:00:00.000Z'),
        metadata: {
          streaming: true,
          status: 'running',
        },
      },
    ],
    messagesByConversation: {
      'conversation-1': [
        {
          id: messageId,
          role: 'assistant',
          content: 'Working...',
          timestamp: new Date('2026-04-06T10:00:00.000Z'),
          metadata: {
            streaming: true,
            status: 'running',
          },
        },
      ],
    },
  });
  return messageId;
}

describe('agentWorkflowEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().resetOnLogout();
    useAgentStore.getState().resetOnLogout();
    useToolStore.getState().resetOnLogout();
  });

  it('applies plan updates to the canonical plan store and action log ownership', async () => {
    const messageId = createAssistantMessage();
    useToolStore.getState().setWorkflowContext({
      hash: 'existing-hash',
      entryPoint: 'Investigate repository',
      description: 'Investigate repository',
    });

    await applyAgentPlanUpdate({
      plan: {
        id: 'plan-1',
        description: 'Analyze runtime event ownership',
        steps: [
          {
            id: 'step-1',
            title: 'Inspect listeners',
            status: 'in_progress',
          },
          {
            id: 'step-2',
            title: 'Centralize reducers',
            status: 'pending',
          },
        ],
      },
    });

    const expectedHash = await sha256('Investigate repository::Analyze runtime event ownership');
    const toolState = useToolStore.getState();
    const planLogEntry = toolState.actionLog.find((entry) => entry.id === 'plan-1');

    expect(toolState.plan).toMatchObject({
      id: 'plan-1',
      description: 'Analyze runtime event ownership',
      steps: [
        { id: 'step-1', title: 'Inspect listeners', status: 'running' },
        { id: 'step-2', title: 'Centralize reducers', status: 'pending' },
      ],
    });
    expect(toolState.workflowContext).toMatchObject({
      hash: expectedHash,
      description: 'Analyze runtime event ownership',
      entryPoint: 'Investigate repository',
    });
    expect(planLogEntry).toMatchObject({
      id: 'plan-1',
      type: 'plan',
      title: 'Plan generated',
      status: 'success',
      workflowHash: expectedHash,
    });
    expect(planLogEntry?.metadata?.['messageId']).toBe(messageId);
  });

  it('upserts action updates instead of duplicating action log entries', () => {
    createAssistantMessage();

    applyAgentActionUpdate({
      action: {
        id: 'action-1',
        type: 'browser',
        title: 'Open page',
        description: 'Navigate to docs',
        status: 'running',
      },
    });
    applyAgentActionUpdate({
      action: {
        id: 'action-1',
        type: 'browser',
        title: 'Open page',
        description: 'Navigation finished',
        status: 'completed',
        result: 'Loaded docs',
      },
    });

    const entries = useToolStore.getState().actionLog.filter((entry) => entry.id === 'action-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'action-1',
      status: 'success',
      result: 'Loaded docs',
      description: 'Navigation finished',
    });
  });

  it('routes permission-required events through canonical approval ownership', () => {
    const messageId = createAssistantMessage();

    applyAgentPermissionRequired({
      actionId: 'approval-1',
      workflowHash: 'wf-1',
      title: 'Delete file',
      reason: 'Requires deleting /tmp/output.txt',
      scope: {
        type: 'filesystem',
        path: '/tmp/output.txt',
        risk: 'high',
      },
      riskLevel: 'high',
      type: 'file_delete',
      actionSignature: 'delete:/tmp/output.txt',
    });

    const toolState = useToolStore.getState();
    const approval = toolState.pendingApprovals.find((entry) => entry.id === 'approval-1');
    const logEntry = toolState.actionLog.find((entry) => entry.id === 'approval-1');

    expect(approval).toMatchObject({
      id: 'approval-1',
      type: 'file_delete',
      riskLevel: 'high',
      workflowHash: 'wf-1',
      actionSignature: 'delete:/tmp/output.txt',
      messageId,
    });
    expect(approval?.details['messageId']).toBe(messageId);
    expect(logEntry).toMatchObject({
      id: 'approval-1',
      status: 'blocked',
      requiresApproval: true,
      type: 'filesystem',
    });
  });

  it('records step start and task failure in the canonical trail/log path', () => {
    createAssistantMessage();

    applyAgentStepStarted({
      taskId: 'task-1',
      step: 'Open dashboard',
      stepIndex: 0,
      totalSteps: 3,
      type: 'browser',
      url: 'https://example.com',
    });
    applyAgentTaskFailed({
      taskId: 'task-1',
      error: 'Navigation failed',
    });

    const agentState = useAgentStore.getState();
    const toolState = useToolStore.getState();

    expect(agentState.actionTrail[0]).toMatchObject({
      type: 'running',
      message: 'Step 1/3: Open dashboard',
    });
    expect(agentState.actionTrail[1]).toMatchObject({
      type: 'error',
      message: 'Task failed: Navigation failed',
    });
    expect(toolState.actionLog.find((entry) => entry.id === 'task-1-step-0')).toMatchObject({
      id: 'task-1-step-0',
      type: 'plan',
      status: 'running',
    });
    expect(toolState.actionLog.find((entry) => entry.id === 'task-1')).toMatchObject({
      id: 'task-1',
      type: 'plan',
      status: 'failed',
      error: 'Navigation failed',
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agi:browser-active',
      }),
    );
  });

  it('routes tool confirmation requests through canonical approval ownership', () => {
    const messageId = createAssistantMessage();

    applyToolConfirmationRequired({
      request_id: 'tool-confirm-1',
      tool_name: 'mcp__filesystem__delete_file',
      tool_display_name: 'Delete file',
      description: 'Delete /tmp/report.txt',
      parameters_summary: '{"path":"/tmp/report.txt"}',
      risk_level: 'high',
      safety_tier: 'dangerous',
      reason: 'Cleanup temp file',
      reversible: false,
    });

    const approval = useToolStore
      .getState()
      .pendingApprovals.find((entry) => entry.id === 'tool-confirm-1');

    expect(approval).toMatchObject({
      id: 'tool-confirm-1',
      type: 'mcp_tool',
      riskLevel: 'high',
      messageId,
    });
    expect(approval?.details['tool']).toBe('Delete file');
    expect(approval?.details['messageId']).toBe(messageId);
  });

  it('escalates dangerous MCP confirmations without trusting display-only parameter summaries', () => {
    createAssistantMessage();

    applyToolConfirmationRequired({
      request_id: 'mcp-dangerous-low-risk',
      tool_name: 'mcp__filesystem__delete_file',
      tool_display_name: 'Delete file',
      description: 'Delete /tmp/report.txt',
      parameters_summary: 'path: "/tmp/report-with-a-very-long-name-that-was-truncated-by-rust..."',
      risk_level: 'low',
      safety_tier: 'dangerous',
      reason: 'Cleanup temp file',
      reversible: false,
    });

    const approval = useToolStore
      .getState()
      .pendingApprovals.find((entry) => entry.id === 'mcp-dangerous-low-risk');

    expect(approval).toMatchObject({
      riskLevel: 'high',
    });
    expect(approval?.actionSignature).toBeUndefined();
    expect(approval?.details['signatureUnavailableReason']).toContain('canonical');
  });

  it('records tool confirmation timeouts in the visible activity log', () => {
    const messageId = createAssistantMessage();

    applyToolConfirmationRequired({
      request_id: 'tool-confirm-timeout',
      tool_name: 'mcp__filesystem__delete_file',
      tool_display_name: 'Delete file',
      description: 'Delete /tmp/report.txt',
      parameters_summary: '{"path":"/tmp/report.txt"}',
      risk_level: 'high',
      safety_tier: 'dangerous',
      reason: 'Cleanup temp file',
      reversible: false,
    });
    applyToolConfirmationTimeout({ request_id: 'tool-confirm-timeout' });

    const toolState = useToolStore.getState();
    const agentState = useAgentStore.getState();

    expect(toolState.pendingApprovals).toHaveLength(0);
    expect(toolState.actionLog.find((entry) => entry.id === 'tool-confirm-timeout')).toMatchObject({
      id: 'tool-confirm-timeout',
      type: 'approval',
      title: 'Approval timed out',
      status: 'failed',
      error: 'Delete file timed out waiting for approval.',
      metadata: {
        messageId,
        toolName: 'Delete file',
      },
    });
    expect(agentState.actionTrail[0]).toMatchObject({
      type: 'error',
      message: 'Delete file timed out waiting for approval.',
      metadata: {
        messageId,
        approvalId: 'tool-confirm-timeout',
      },
    });
  });

  it('ignores stale tool confirmation timeout events after an approval is resolved', () => {
    createAssistantMessage();

    applyToolConfirmationTimeout({ request_id: 'unknown-confirmation' });

    expect(useToolStore.getState().pendingApprovals).toHaveLength(0);
    expect(useToolStore.getState().actionLog).toHaveLength(0);
    expect(useAgentStore.getState().actionTrail).toHaveLength(0);
  });

  it('tracks approval requests and denials through the canonical approval store', () => {
    createAssistantMessage();

    applyApprovalRequest({
      id: 'approval-2',
      type: 'terminal_command',
      description: 'Run rm -rf /tmp/cache',
      riskLevel: 'high',
      details: { command: 'rm -rf /tmp/cache' },
    });
    applyApprovalDenied({
      approval: {
        id: 'approval-2',
        type: 'terminal_command',
        description: 'Run rm -rf /tmp/cache',
        riskLevel: 'high',
        details: { command: 'rm -rf /tmp/cache' },
        createdAt: new Date(),
        status: 'pending',
        rejectionReason: 'Denied by operator',
      },
    });

    const toolState = useToolStore.getState();

    expect(toolState.pendingApprovals).toHaveLength(0);
    expect(toolState.actionLog.find((entry) => entry.id === 'approval-2')).toMatchObject({
      id: 'approval-2',
      status: 'failed',
      error: 'Denied by operator',
    });
  });

  it('tracks live goal progress and completion via canonical reducers', () => {
    createAssistantMessage();
    useAgentStore.setState({
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          status: 'running',
          currentGoal: 'goal-1',
          currentStep: 'Planning',
          progress: 0,
          startedAt: new Date('2026-04-06T10:00:00.000Z'),
        },
      ],
      agentStatus: {
        id: 'agent-1',
        name: 'Agent 1',
        status: 'running',
        currentGoal: 'goal-1',
        currentStep: 'Planning',
        progress: 0,
        startedAt: new Date('2026-04-06T10:00:00.000Z'),
      },
    });

    applyGoalProgress({
      goal_id: 'goal-1',
      completed_steps: 2,
      total_steps: 5,
      progress_percent: 40,
    });
    applyGoalAchieved({
      goal_id: 'goal-1',
      completed_steps: 5,
      total_steps: 5,
    });

    const agentState = useAgentStore.getState();
    const completionLog = useToolStore
      .getState()
      .actionLog.find((entry) => entry.id === 'goal-goal-1-complete');

    expect(agentState.agents[0]).toMatchObject({
      id: 'agent-1',
      status: 'completed',
      progress: 100,
    });
    expect(agentState.agentStatus).toMatchObject({
      id: 'agent-1',
      status: 'completed',
      progress: 100,
    });
    expect(agentState.actionTrail[0]).toMatchObject({
      type: 'running',
      message: 'Progress: 40%',
    });
    expect(agentState.actionTrail[1]).toMatchObject({
      type: 'completed',
      message: 'Completed 5/5 steps',
    });
    expect(completionLog).toMatchObject({
      id: 'goal-goal-1-complete',
      status: 'success',
    });
  });

  it('updates plan steps from AGI goal step completion events', () => {
    createAssistantMessage();
    useToolStore.getState().setPlan({
      id: 'plan-2',
      description: 'Execute plan',
      createdAt: new Date('2026-04-06T10:00:00.000Z'),
      updatedAt: new Date('2026-04-06T10:00:00.000Z'),
      steps: [
        {
          id: 'step-1',
          title: 'Apply migration',
          status: 'running',
        },
      ],
    });

    applyGoalStepCompleted({
      goal_id: 'goal-2',
      step_id: 'step-1',
      success: true,
      execution_time_ms: 1200,
    });

    const toolState = useToolStore.getState();
    expect(toolState.plan?.steps[0]).toMatchObject({
      id: 'step-1',
      status: 'success',
      result: 'Completed in 1200ms',
    });
    expect(toolState.actionLog.find((entry) => entry.id === 'step-1')).toMatchObject({
      id: 'step-1',
      status: 'success',
      result: 'Completed in 1200ms',
    });
  });

  it('records background agent completion in the canonical action log path', async () => {
    createAssistantMessage();

    await applyBackgroundAgentCompleted({
      agentId: 'bg-agent-1',
      goal: 'Compile weekly report',
      summaryPath: '/tmp/weekly-report.md',
    });

    expect(
      useToolStore.getState().actionLog.find((entry) => entry.id === 'bg-agent-1'),
    ).toMatchObject({
      id: 'bg-agent-1',
      status: 'success',
      title: 'Background task completed',
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agi:browser-active',
      }),
    );
  });
});
