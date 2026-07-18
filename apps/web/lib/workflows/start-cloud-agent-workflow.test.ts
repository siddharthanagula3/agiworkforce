import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const workflowMocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  buildInput: vi.fn(),
}));

vi.mock('workflow/api', () => ({ start: workflowMocks.start }));
vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  attachCloudAgentWorkflow: workflowMocks.attach,
}));
vi.mock('./cloud-agent-workflow-input', () => ({
  buildCloudAgentWorkflowInput: workflowMocks.buildInput,
}));
vi.mock('./cloud-agent-workflow', () => ({ cloudAgentWorkflow: vi.fn() }));

import { startCloudAgentWorkflowExecution } from './start-cloud-agent-workflow';

describe('cloud agent workflow starter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts, durably attaches, and returns the replayable workflow stream', async () => {
    const readable = new ReadableStream<Uint8Array>();
    const workflowRun = {
      runId: 'wrun_123',
      getReadable: vi.fn(() => readable),
      cancel: vi.fn(),
    };
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue(workflowRun);
    workflowMocks.attach.mockResolvedValue(undefined);

    await expect(
      startCloudAgentWorkflowExecution({
        db: {} as never,
        runId: '0190a000-0000-7000-8000-000000000001',
        userId: 'user-1',
        processed: {} as never,
        mcpTools: [],
        approvalMode: 'auto',
      }),
    ).resolves.toEqual({ workflowRunId: 'wrun_123', readable });

    expect(workflowMocks.start).toHaveBeenCalledWith(expect.any(Function), [{ version: 1 }]);
    expect(workflowMocks.attach).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workflowRunId: 'wrun_123' }),
    );
  });

  it('cancels a started workflow when the durable attachment fails', async () => {
    const workflowRun = {
      runId: 'wrun_123',
      getReadable: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    workflowMocks.buildInput.mockReturnValue({ version: 1 });
    workflowMocks.start.mockResolvedValue(workflowRun);
    workflowMocks.attach.mockRejectedValue(new Error('attach failed'));

    await expect(
      startCloudAgentWorkflowExecution({
        db: {} as never,
        runId: '0190a000-0000-7000-8000-000000000001',
        userId: 'user-1',
        processed: {} as never,
        mcpTools: [],
        approvalMode: 'auto',
      }),
    ).rejects.toThrow('attach failed');
    expect(workflowRun.cancel).toHaveBeenCalledOnce();
  });
});
