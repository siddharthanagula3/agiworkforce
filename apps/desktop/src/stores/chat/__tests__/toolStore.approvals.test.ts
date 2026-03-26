import { beforeEach, describe, expect, it } from 'vitest';
import { enableMapSet } from 'immer';
import { useToolStore, type ApprovalRequest } from '../toolStore';

// Immer MapSet plugin required for stores using Map/Set in state
enableMapSet();

const baseApproval: Omit<ApprovalRequest, 'createdAt' | 'status'> = {
  id: 'approval-1',
  type: 'mcp_tool',
  description: 'Delete a file',
  riskLevel: 'high',
  details: {
    path: '/tmp/example.txt',
  },
};

describe('toolStore approval audit trail', () => {
  beforeEach(() => {
    useToolStore.setState({
      fileOperations: [],
      terminalCommands: [],
      toolExecutions: [],
      screenshots: [],
      actionLog: [],
      pendingApprovals: [],
      trustedWorkflows: {},
      activeContext: [],
      workflowContext: null,
      plan: null,
      activeToolStreams: new Map(),
      filters: {
        fileOperations: [],
        terminalStatus: [],
        toolNames: [],
      },
    });
  });

  it('records a blocked audit entry when an approval is requested and marks it successful on approve', () => {
    const store = useToolStore.getState();

    store.addApprovalRequest(baseApproval);

    let state = useToolStore.getState();
    expect(state.pendingApprovals).toHaveLength(1);
    expect(state.actionLog[0]?.type).toBe('approval');
    expect(state.actionLog[0]?.status).toBe('blocked');
    expect(state.actionLog[0]?.title).toBe('Delete a file');

    store.approveOperation(baseApproval.id);

    state = useToolStore.getState();
    expect(state.pendingApprovals).toHaveLength(0);
    expect(state.actionLog[0]?.status).toBe('success');
    expect(state.actionLog[0]?.result).toBe('Approved by user');
  });

  it('preserves a failed audit entry when an approval is rejected', () => {
    const store = useToolStore.getState();

    store.addApprovalRequest(baseApproval);
    store.rejectOperation(baseApproval.id, 'User rejected dangerous delete');

    const state = useToolStore.getState();
    expect(state.pendingApprovals).toHaveLength(0);
    expect(state.actionLog[0]?.type).toBe('approval');
    expect(state.actionLog[0]?.status).toBe('failed');
    expect(state.actionLog[0]?.error).toBe('User rejected dangerous delete');
  });
});
