import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperWorktree,
  DeveloperWorktreeSetupScript,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';

const listLocalCheckpoints = vi.fn();
const runLocalWorktreeSetup = vi.fn();
const emitSessionEvent: { current: ((rootId: string, event: unknown) => void) | null } = {
  current: null,
};

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConfirmAction: () => ({ confirm: vi.fn(), dialog: null }),
}));

vi.mock('@/features/desktop-host', () => ({
  compactDeveloperThread: vi.fn(),
  onDeveloperSessionEvent: (listener: (rootId: string, event: unknown) => void) => {
    emitSessionEvent.current = listener;
    return () => {
      emitSessionEvent.current = null;
    };
  },
}));

vi.mock('../local-summaries', () => ({ runThreadSummary: vi.fn() }));

vi.mock('../components/LocalRewindChooser', () => ({ LocalRewindChooser: () => null }));

vi.mock('../services/local-review-client', () => ({
  applyLocalWorktree: vi.fn(),
  deleteLocalWorktree: vi.fn(),
  listLocalCheckpoints,
  pinLocalWorktree: vi.fn(),
  readLocalCheckpointDiff: vi.fn(),
  revertLocalSections: vi.fn(),
  rewindLocalThread: vi.fn(),
  runLocalWorktreeSetup,
  stageLocalSections: vi.fn(),
}));

const { useLocalReview } = await import('./use-local-review');

const session = { rootId: 'root-1', id: 'thread-1' } as LocalDeveloperSession;
const worktree = { id: 'wt-1', pinned: false, setupExitCode: null } as DeveloperWorktree;
const script = {
  path: 'setup.sh',
  sha256: 'a'.repeat(64),
  approved: true,
} as DeveloperWorktreeSetupScript;
const callbacks = { onRewound: vi.fn(), onWorktreeRemoved: vi.fn() };

function mount() {
  return renderHook(() => useLocalReview(session, worktree, true, callbacks));
}

beforeEach(() => {
  vi.clearAllMocks();
  emitSessionEvent.current = null;
  listLocalCheckpoints.mockResolvedValue({ turns: [] });
});

describe('useLocalReview setup', () => {
  it('returns to a retryable state when the native request is rejected', async () => {
    runLocalWorktreeSetup.mockRejectedValueOnce(new Error('Cancelled'));
    const { result } = mount();

    await act(async () => {
      result.current.runSetup(script);
    });

    expect(runLocalWorktreeSetup).toHaveBeenCalledWith('root-1', script.sha256);
    expect(result.current.setup).toBe('idle');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).not.toBeNull();

    runLocalWorktreeSetup.mockResolvedValueOnce(true);
    await act(async () => {
      result.current.runSetup(script);
    });

    expect(runLocalWorktreeSetup).toHaveBeenCalledTimes(2);
    expect(result.current.setup).toBe('running');
  });

  it('keeps an accepted run running until its finished event', async () => {
    runLocalWorktreeSetup.mockResolvedValueOnce(true);
    const { result } = mount();

    await act(async () => {
      result.current.runSetup(script);
    });
    expect(result.current.setup).toBe('running');

    act(() => {
      emitSessionEvent.current?.('root-1', {
        type: 'worktree-setup-finished',
        threadId: 'thread-1',
        succeeded: true,
        exitCode: 0,
      });
    });

    expect(result.current.setup).toBe('passed');
    expect(result.current.setupExitCode).toBe(0);
  });
});
