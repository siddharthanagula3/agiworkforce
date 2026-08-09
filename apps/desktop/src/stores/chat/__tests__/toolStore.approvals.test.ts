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

  it('leaves native MCP timeout ownership with the fail-closed backend channel', () => {
    const store = useToolStore.getState();

    store.addApprovalRequest({
      ...baseApproval,
      timeoutSeconds: 120,
    });

    let state = useToolStore.getState();
    expect(state.pendingApprovals[0]?.timeoutSeconds).toBe(120);
    expect(state.approvalTimeoutTimers.has(baseApproval.id)).toBe(false);

    store.handleApprovalTimeout(baseApproval.id);

    state = useToolStore.getState();
    expect(state.pendingApprovals).toHaveLength(1);
    expect(state.pendingApprovals[0]?.status).toBe('pending');
    expect(state.approvalTimeoutTimers.has(baseApproval.id)).toBe(false);
  });

  describe('standing auto-approvals never come off disk', () => {
    it('keeps trusted workflows out of the persisted payload', () => {
      useToolStore.getState().setTrustedWorkflow({
        hash: 'wf-hash-1',
        createdAt: new Date(),
        actionSignatures: ['delete_file'],
      });
      expect(useToolStore.getState().isActionTrusted('wf-hash-1', 'delete_file')).toBe(true);

      const written = window.localStorage.getItem('tool-storage');
      expect(written).not.toBeNull();
      const persisted = JSON.parse(written as string) as { state: Record<string, unknown> };
      expect(persisted.state).not.toHaveProperty('trustedWorkflows');
    });

    it('drops a trust grant left behind by an older storage version', async () => {
      window.localStorage.setItem(
        'tool-storage',
        JSON.stringify({
          version: 1,
          state: {
            trustedWorkflows: {
              'wf-hash-1': { hash: 'wf-hash-1', actionSignatures: ['delete_file'] },
            },
            filters: { fileOperations: [], terminalStatus: [], toolNames: [] },
          },
        }),
      );

      await useToolStore.persist.rehydrate();

      expect(useToolStore.getState().trustedWorkflows).toEqual({});
      expect(useToolStore.getState().isActionTrusted('wf-hash-1', 'delete_file')).toBe(false);
    });
  });
});
