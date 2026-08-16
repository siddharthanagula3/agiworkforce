import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privacyMode: 'managed' as 'local' | 'byok' | 'managed',
  hasCloudSession: true,
  listRuns: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/api/cloudApi', () => ({
  createDesktopCloudAgentRunClient: (...args: unknown[]) => {
    mocks.createClient(...args);
    return { listRuns: mocks.listRuns };
  },
}));

vi.mock('../auth', () => ({
  selectHasCloudAccountSession: () => mocks.hasCloudSession,
  useUnifiedAuthStore: { getState: () => ({}) },
}));

vi.mock('../appModeStore', () => ({
  selectPrivacyMode: () => mocks.privacyMode,
  useAppModeStore: { getState: () => ({}) },
}));

const { useCloudTaskBadgeStore } = await import('../cloudTaskBadgeStore');

function run(state: string) {
  return { state };
}

describe('cloudTaskBadgeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'managed';
    mocks.hasCloudSession = true;
    mocks.listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    useCloudTaskBadgeStore.getState().reset();
  });

  it('does not touch the cloud at all in a Local session', async () => {
    mocks.privacyMode = 'local';

    await useCloudTaskBadgeStore.getState().refresh();

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.listRuns).not.toHaveBeenCalled();
    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(0);
    expect(useCloudTaskBadgeStore.getState().status).toBe('idle');
  });

  it('does not touch the cloud when managed but signed out', async () => {
    mocks.hasCloudSession = false;

    await useCloudTaskBadgeStore.getState().refresh();

    expect(mocks.listRuns).not.toHaveBeenCalled();
    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(0);
  });

  it('counts only the runs actually waiting on the user', async () => {
    mocks.listRuns.mockResolvedValue({
      runs: [
        run('awaiting_input'),
        run('paused'),
        run('running'),
        run('queued'),
        run('awaiting_input'),
      ],
      nextCursor: null,
    });

    await useCloudTaskBadgeStore.getState().refresh();

    const state = useCloudTaskBadgeStore.getState();
    expect(state.needsUserCount).toBe(3);
    expect(state.activeCount).toBe(5);
    expect(state.truncated).toBe(false);
    expect(state.status).toBe('loaded');
  });

  it('asks the server only for unfinished states', async () => {
    await useCloudTaskBadgeStore.getState().refresh();

    expect(mocks.listRuns).toHaveBeenCalledTimes(1);
    const options = mocks.listRuns.mock.calls[0]?.[0] as { states: string[] };
    expect(options.states).toEqual(['queued', 'running', 'awaiting_input', 'paused']);
    expect(options.states).not.toContain('completed');
  });

  it('marks the count as a floor when the server had another page', async () => {
    mocks.listRuns.mockResolvedValue({
      runs: [run('awaiting_input')],
      nextCursor: 'more',
    });

    await useCloudTaskBadgeStore.getState().refresh();

    expect(useCloudTaskBadgeStore.getState().truncated).toBe(true);
  });

  it('clears the count on a failed poll instead of leaving a stale badge', async () => {
    mocks.listRuns.mockResolvedValue({ runs: [run('awaiting_input')], nextCursor: null });
    await useCloudTaskBadgeStore.getState().refresh();
    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(1);

    mocks.listRuns.mockRejectedValue(new Error('network down'));
    await useCloudTaskBadgeStore.getState().refresh();

    const state = useCloudTaskBadgeStore.getState();
    expect(state.needsUserCount).toBe(0);
    expect(state.status).toBe('error');
    expect(state.error).toBe('network down');
  });

  it('drops a response that arrives after the session left managed mode', async () => {
    mocks.listRuns.mockImplementation(async () => {
      mocks.privacyMode = 'local';
      return { runs: [run('awaiting_input'), run('paused')], nextCursor: null };
    });

    await useCloudTaskBadgeStore.getState().refresh();

    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(0);
    expect(useCloudTaskBadgeStore.getState().status).toBe('idle');
  });

  it('reset clears a live count', async () => {
    mocks.listRuns.mockResolvedValue({ runs: [run('paused')], nextCursor: null });
    await useCloudTaskBadgeStore.getState().refresh();
    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(1);

    useCloudTaskBadgeStore.getState().reset();

    expect(useCloudTaskBadgeStore.getState().needsUserCount).toBe(0);
    expect(useCloudTaskBadgeStore.getState().status).toBe('idle');
  });
});
