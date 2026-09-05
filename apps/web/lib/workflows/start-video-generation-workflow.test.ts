import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('workflow/api', () => ({ start: mocks.start }));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  attachVideoGenerationWorkflow: (...args: unknown[]) => mocks.attach(...args),
  getVideoGenerationJob: (...args: unknown[]) => mocks.get(...args),
  getVideoGenerationJobForSystem: vi.fn(),
  reconcileVideoGenerationBillingSettlement: vi.fn(),
  recoverVideoProviderTaskAttachment: vi.fn(),
}));
vi.mock('./video-generation-workflow', () => ({
  videoGenerationWorkflow: vi.fn(),
  videoProviderTaskAttachmentWorkflow: vi.fn(),
}));

import {
  startVideoGenerationWorkflowExecution,
  startVideoGenerationWorkflowOwner,
  startVideoProviderTaskAttachmentRecovery,
} from './start-video-generation-workflow';

describe('video generation workflow starter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ runId: 'wrun-video-1', cancel: mocks.cancel });
    mocks.attach.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue(null);
    mocks.cancel.mockResolvedValue(undefined);
  });

  it('attaches the durable workflow before returning to the provider boundary', async () => {
    await expect(
      startVideoGenerationWorkflowExecution({ db: {} as never, jobId: 'job-1', userId: 'user-1' }),
    ).resolves.toEqual({ workflowRunId: 'wrun-video-1' });

    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        userId: 'user-1',
        workflowRunId: 'wrun-video-1',
      }),
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('prestarts an owner before INSERT without persisting a user id', async () => {
    await expect(startVideoGenerationWorkflowOwner({ jobId: 'job-1' })).resolves.toMatchObject({
      workflowRunId: 'wrun-video-1',
      cancel: expect.any(Function),
    });
    const input = mocks.start.mock.calls[0]?.[1]?.[0];
    expect(input).toMatchObject({
      version: 1,
      jobId: 'job-1',
      startedAtEpochMs: expect.any(Number),
    });
    expect(input).not.toHaveProperty('userId');
  });

  it('rejects instead of burning the invocation when the workflow engine never answers', async () => {
    vi.useFakeTimers();
    try {
      const { VIDEO_WORKFLOW_START_DEADLINE_MS } = await import('./video-generation-timing');
      mocks.start.mockReturnValueOnce(new Promise(() => {}));
      const pending = startVideoGenerationWorkflowOwner({ jobId: 'job-1' });
      const assertion = expect(pending).rejects.toThrow(/exceeded its deadline/);
      await vi.advanceTimersByTimeAsync(VIDEO_WORKFLOW_START_DEADLINE_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers a committed attachment whose response was lost', async () => {
    mocks.attach.mockRejectedValueOnce(new Error('connection lost'));
    mocks.get.mockResolvedValueOnce({ workflowRunId: 'wrun-video-1' });

    await expect(
      startVideoGenerationWorkflowExecution({ db: {} as never, jobId: 'job-1', userId: 'user-1' }),
    ).resolves.toEqual({ workflowRunId: 'wrun-video-1' });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('cancels a run that could not be durably attached', async () => {
    mocks.attach.mockRejectedValueOnce(new Error('attach failed'));

    await expect(
      startVideoGenerationWorkflowExecution({ db: {} as never, jobId: 'job-1', userId: 'user-1' }),
    ).rejects.toThrow('attach failed');
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });

  it('serializes the known provider id into a separate durable recovery run', async () => {
    await expect(
      startVideoProviderTaskAttachmentRecovery({
        jobId: 'job-1',
        providerTaskId: 'operations/provider-task',
      }),
    ).resolves.toEqual({ workflowRunId: 'wrun-video-1' });

    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      {
        version: 1,
        jobId: 'job-1',
        providerTaskId: 'operations/provider-task',
      },
    ]);
  });
});
