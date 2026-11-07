import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useMediaStore, type MediaJob } from './media-store';

const job: MediaJob = {
  id: 'media-job',
  type: 'image',
  prompt: 'fixture image',
  status: 'generating',
  createdAt: '2026-11-04T00:00:00.000Z',
};

function owner(isCurrent: () => boolean): SessionAuthority {
  return {
    userId: 'same-user',
    sessionId: 'same-session',
    isCurrent,
    getToken: async () => 'token',
  };
}

beforeEach(() => useMediaStore.getState().reset());

describe('session-owned media registry', () => {
  it('refuses already-retired ownership without changing state', () => {
    const current = useMediaStore.getState();
    current.addJob(
      job,
      owner(() => false),
    );
    expect(useMediaStore.getState()).toBe(current);
    expect(useMediaStore.getState().jobs).toEqual([]);
  });

  it('keeps state identity when pruning has nothing to retire', () => {
    const empty = useMediaStore.getState();
    empty.retireStaleJobs();
    expect(useMediaStore.getState()).toBe(empty);
    useMediaStore.getState().addJob(
      job,
      owner(() => true),
    );
    const current = useMediaStore.getState();
    current.retireStaleJobs();
    current.retireStaleJobs();
    expect(useMediaStore.getState()).toBe(current);
  });

  it('removes only retired owners even when session IDs and job IDs match', () => {
    let current = true;
    const previous = owner(() => current);
    const replacement = owner(() => true);
    useMediaStore.getState().addJob(job, previous);
    current = false;
    useMediaStore.getState().addJob({ ...job, prompt: 'replacement image' }, replacement);
    useMediaStore.getState().retireStaleJobs();
    expect(useMediaStore.getState().jobs).toEqual([
      { ...job, prompt: 'replacement image', owner: replacement },
    ]);
  });

  it('does not resurrect a retired row through late map-only updates', () => {
    let current = true;
    useMediaStore.getState().addJob(
      job,
      owner(() => current),
    );
    current = false;
    useMediaStore.getState().retireStaleJobs();
    useMediaStore.getState().addJob(
      { ...job, id: 'replacement' },
      owner(() => true),
    );
    const replacement = useMediaStore.getState().jobs[0];
    useMediaStore.getState().updateJob(job.id, { status: 'completed', resultUrl: '/old-result' });
    expect(useMediaStore.getState().jobs).toEqual([replacement]);
  });

  it('keeps the stored session owner through terminal updates', () => {
    const session = owner(() => true);
    useMediaStore.getState().addJob(job, session);
    useMediaStore.getState().updateJob(job.id, { status: 'completed', resultUrl: '/result' });
    expect(useMediaStore.getState().jobs[0]?.owner).toBe(session);
  });
});
