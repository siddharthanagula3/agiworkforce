import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { MediaJobEntry } from '@agiworkforce/cloud-contracts';

const mockListMediaJobs = jest.fn();

jest.mock('@/src/features/library/libraryClient', () => ({
  listMediaJobs: (...args: unknown[]) => mockListMediaJobs(...args),
  cancelMediaJob: jest.fn(),
  retryMediaJob: jest.fn(),
}));

import { MediaJobsSection } from '@/src/features/library/MediaJobsSection';

function job(id: string, status: MediaJobEntry['status']): MediaJobEntry {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    kind: 'image',
    status,
    prompt: `prompt ${id}`,
    model: 'image-model',
    created_at: '2026-11-10T00:00:00.000Z',
    updated_at: '2026-11-10T00:00:00.000Z',
    error: null,
    retryable: false,
    cancellable: status === 'running',
    progress: null,
    result_urls: [],
    conversation_id: null,
  };
}

async function pollOnce(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });
}

describe('MediaJobsSection completion', () => {
  const originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState');

  beforeEach(() => {
    jest.useFakeTimers();
    mockListMediaJobs.mockReset();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      writable: true,
      value: 'active',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalState) Object.defineProperty(AppState, 'currentState', originalState);
  });

  it('asks the Library to reload once when an in-flight job turns done', async () => {
    const onJobsCompleted = jest.fn();
    mockListMediaJobs.mockResolvedValueOnce([job('1', 'running')]);
    render(<MediaJobsSection onOpenConversation={jest.fn()} onJobsCompleted={onJobsCompleted} />);
    await act(async () => undefined);
    expect(onJobsCompleted).not.toHaveBeenCalled();

    mockListMediaJobs.mockResolvedValue([job('1', 'done')]);
    await pollOnce();
    expect(onJobsCompleted).toHaveBeenCalledTimes(1);

    await pollOnce();
    expect(onJobsCompleted).toHaveBeenCalledTimes(1);
  });

  it('coalesces two jobs that finish between polls into one reload', async () => {
    const onJobsCompleted = jest.fn();
    mockListMediaJobs.mockResolvedValueOnce([job('1', 'running'), job('2', 'queued')]);
    render(<MediaJobsSection onOpenConversation={jest.fn()} onJobsCompleted={onJobsCompleted} />);
    await act(async () => undefined);

    mockListMediaJobs.mockResolvedValue([job('1', 'done'), job('2', 'done')]);
    await pollOnce();

    expect(onJobsCompleted).toHaveBeenCalledTimes(1);
  });

  it('does not reload for a job that was already done or that failed', async () => {
    const onJobsCompleted = jest.fn();
    mockListMediaJobs.mockResolvedValueOnce([job('1', 'done'), job('2', 'running')]);
    render(<MediaJobsSection onOpenConversation={jest.fn()} onJobsCompleted={onJobsCompleted} />);
    await act(async () => undefined);

    mockListMediaJobs.mockResolvedValue([job('1', 'done'), job('2', 'failed')]);
    await pollOnce();

    expect(onJobsCompleted).not.toHaveBeenCalled();
  });
});
