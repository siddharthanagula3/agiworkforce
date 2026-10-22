import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperSessionEvent,
  DeveloperWorktree,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { CheckpointDiffResponse, CheckpointListResponse } from '@agiworkforce/types/protocol';

const listLocalCheckpoints = vi.fn();
const readLocalCheckpointDiff = vi.fn();
const revertLocalSections = vi.fn();
const stageLocalSections = vi.fn();
const rewindLocalThread = vi.fn();
const applyLocalWorktree = vi.fn();
const deleteLocalWorktree = vi.fn();
const pinLocalWorktree = vi.fn();
const runLocalWorktreeSetup = vi.fn();

vi.mock('../services/local-review-client', () => ({
  listLocalCheckpoints,
  readLocalCheckpointDiff,
  revertLocalSections,
  stageLocalSections,
  rewindLocalThread,
  applyLocalWorktree,
  deleteLocalWorktree,
  pinLocalWorktree,
  runLocalWorktreeSetup,
  localWorktreeKeep: vi.fn(),
}));

let emit: ((rootId: string, event: DeveloperSessionEvent) => void) | null = null;
const compactDeveloperThread = vi.fn();

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  compactDeveloperThread,
  onDeveloperSessionEvent: (listener: (rootId: string, event: DeveloperSessionEvent) => void) => {
    emit = listener;
    return () => {
      emit = null;
    };
  },
}));

const { useLocalReview } = await import('../hooks/use-local-review');
const { LocalReviewPane } = await import('./LocalReviewPane');

const WORKTREE_ROOT = 'root-1::worktree::0a1b2c3d';

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: WORKTREE_ROOT,
  title: 'Fix the build',
  cwd: '/home/qa/.agiworkforce/worktrees/qa-project/0a1b2c3d/checkout',
  model: null,
  provider: null,
  trustMode: 'local',
  status: 'idle',
  createdAt: '2026-10-10T10:00:00Z',
  updatedAt: '2026-10-10T10:05:00Z',
  origin: 'desktop',
};

const worktree: DeveloperWorktree = {
  id: '0a1b2c3d',
  rootId: 'root-1',
  path: session.cwd,
  label: null,
  start: { kind: 'ref', name: 'HEAD' },
  baseCommit: 'abc123',
  createdAt: '2026-10-10T10:00:00Z',
  threadId: 'thread-1',
  pinned: false,
  active: true,
  missing: false,
  setupScript: {
    path: '/work/qa-project/.agiworkforce/worktree-setup',
    sha256: 'f00d',
    approved: false,
  },
  setupExitCode: null,
  setupRanAt: null,
};

const checkpoints: CheckpointListResponse = {
  threadId: 'thread-1',
  available: true,
  turns: [
    {
      turnId: 'turn-1',
      index: 1,
      startedAt: '2026-10-10T10:01:00Z',
      finishedAt: '2026-10-10T10:02:00Z',
      files: [{ path: 'src/build.ts', status: 'modified', binary: false }],
      rewindable: true,
    },
    {
      turnId: 'turn-2',
      index: 2,
      startedAt: '2026-10-10T10:03:00Z',
      finishedAt: '2026-10-10T10:04:00Z',
      files: [{ path: 'README.md', status: 'added', binary: false }],
      rewindable: false,
    },
  ],
};

const diffOf = (turnId: string, path: string): CheckpointDiffResponse => ({
  threadId: 'thread-1',
  turnId,
  index: turnId === 'turn-1' ? 1 : 2,
  files: [
    {
      path,
      status: 'modified',
      binary: false,
      hunks: [{ index: 0, header: '@@ -1 +1 @@', text: '@@ -1 +1 @@\n-old\n+new\n' }],
    },
  ],
});

function Harness({
  withWorktree = true,
  onRewound = vi.fn(),
  canChooseRestore = false,
  canSummarize = false,
  onSummarized = vi.fn(),
  onSendComments,
}: {
  withWorktree?: boolean;
  onRewound?: (restore: string, turnId: string) => void;
  canChooseRestore?: boolean;
  canSummarize?: boolean;
  onSummarized?: () => void;
  onSendComments?: (message: string) => void;
}) {
  const review = useLocalReview(
    session,
    withWorktree ? worktree : null,
    true,
    { onRewound, onWorktreeRemoved: vi.fn(), onSummarized },
    { canChooseRestore, canSummarize },
  );
  return (
    <LocalReviewPane
      review={review}
      worktree={withWorktree ? worktree : null}
      onClose={vi.fn()}
      {...(onSendComments ? { onSendComments } : {})}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listLocalCheckpoints.mockResolvedValue(checkpoints);
  readLocalCheckpointDiff.mockImplementation(
    async (_root: string, _thread: string, turnId: string) =>
      diffOf(turnId, turnId === 'turn-1' ? 'src/build.ts' : 'README.md'),
  );
});

describe('LocalReviewPane', () => {
  it('opens on the latest turn that changed a file and shows its hunks', async () => {
    render(<Harness />);

    await waitFor(() =>
      expect(readLocalCheckpointDiff).toHaveBeenCalledWith(WORKTREE_ROOT, 'thread-1', 'turn-2'),
    );
    expect(screen.getByRole('button', { name: /Turn 2/u })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(await screen.findByRole('button', { name: /README\.md/u }));
    expect(screen.getByText('+new')).toBeInTheDocument();
  });

  it('totals the added and removed lines of the turn in the header', async () => {
    render(<Harness />);

    const totals = await screen.findByTestId('local-review-totals');
    expect(totals).toHaveTextContent('+1-1');
    expect(within(totals).getByText('+1')).toBeInTheDocument();
    expect(within(totals).getByText('-1')).toBeInTheDocument();
  });

  it('names the file and line above the comment field being written', async () => {
    const user = userEvent.setup();
    render(<Harness onSendComments={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /README\.md/u }));
    await user.click(screen.getByRole('button', { name: 'Comment on line 1 of README.md' }));

    expect(screen.getByText('Comment on line 1 of README.md')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Comment on line 1 of README.md' })).toBeVisible();
  });

  it('sends comments left on lines of the change to the agent as one turn', async () => {
    const user = userEvent.setup();
    const onSendComments = vi.fn();
    render(<Harness onSendComments={onSendComments} />);

    await user.click(await screen.findByRole('button', { name: /README\.md/u }));
    await user.click(screen.getByRole('button', { name: 'Comment on line 1 of README.md' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Comment on line 1 of README.md' }),
      'Keep the old wording here',
    );
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await user.click(
      screen.getByRole('button', { name: 'Comment on removed line 1 of README.md' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Comment on removed line 1 of README.md' }),
      'Why was this removed?',
    );
    await user.click(screen.getByRole('button', { name: 'Add comment' }));

    expect(screen.getByText('2 comments')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send to the agent' }));

    expect(onSendComments).toHaveBeenCalledWith(
      [
        'Address these review comments on your changes:',
        '',
        '1. README.md, line 1 (`new`): Keep the old wording here',
        '2. README.md, removed line 1 (`old`): Why was this removed?',
      ].join('\n'),
    );
    expect(screen.queryByText('2 comments')).not.toBeInTheDocument();
  });

  it('asks before discarding written comments, and offers none where nothing can take them', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness onSendComments={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /README\.md/u }));
    await user.click(screen.getByRole('button', { name: 'Comment on line 1 of README.md' }));
    await user.type(screen.getByRole('textbox', { name: /Comment on line 1/u }), 'Rename this');
    await user.click(screen.getByRole('button', { name: 'Add comment' }));

    await user.click(screen.getByRole('button', { name: 'Discard comments' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be brought back');
    expect(screen.getByText('1 comment')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Discard comments' }));
    await waitFor(() => expect(screen.queryByText('1 comment')).not.toBeInTheDocument());
    unmount();

    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: /README\.md/u }));
    expect(screen.queryByRole('button', { name: /Comment on line/u })).not.toBeInTheDocument();
  });

  it('asks before reverting a hunk and names the file whose change is lost', async () => {
    const user = userEvent.setup();
    revertLocalSections
      .mockResolvedValueOnce({ applied: ['README.md'], conflicted: [], preview: true })
      .mockResolvedValueOnce({ applied: ['README.md'], conflicted: [], preview: false });
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: /README\.md/u }));
    await user.click(screen.getByRole('button', { name: 'Revert' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('README.md');
    expect(revertLocalSections).toHaveBeenCalledTimes(1);
    expect(revertLocalSections).toHaveBeenLastCalledWith(
      expect.objectContaining({ preview: true, sections: [{ path: 'README.md', hunks: [0] }] }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(revertLocalSections).toHaveBeenCalledTimes(2));
    expect(revertLocalSections.mock.calls[1]?.[0]).not.toHaveProperty('preview');
  });

  it('rewinds files and conversation only after the reader sees which files go', async () => {
    const user = userEvent.setup();
    const onRewound = vi.fn();
    rewindLocalThread
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        turnId: 'turn-1',
        preview: true,
        files: ['src/build.ts', 'notes.txt'],
        messagesRemoved: 4,
      })
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        turnId: 'turn-1',
        preview: false,
        files: ['src/build.ts', 'notes.txt'],
        messagesRemoved: 4,
        recoveryRef: 'refs/agiworkforce/rewound/thread-1/1',
      });
    render(<Harness onRewound={onRewound} />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('src/build.ts and notes.txt');
    expect(dialog).toHaveTextContent('4 messages are removed');
    expect(onRewound).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Rewind' }));
    await waitFor(() => expect(onRewound).toHaveBeenCalled());
    expect(rewindLocalThread).toHaveBeenLastCalledWith({
      rootId: WORKTREE_ROOT,
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('restores the code alone after the reader picks it and sees which files go', async () => {
    const user = userEvent.setup();
    const onRewound = vi.fn();
    const restored = {
      threadId: 'thread-1',
      turnId: 'turn-1',
      files: ['src/build.ts'],
      messagesRemoved: 0,
    };
    rewindLocalThread
      .mockResolvedValueOnce({ ...restored, preview: true })
      .mockResolvedValueOnce({ ...restored, preview: false });
    render(<Harness onRewound={onRewound} canChooseRestore />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));
    const choices = await screen.findByRole('dialog');
    expect(choices).toHaveTextContent('edits made by shell commands included');
    expect(rewindLocalThread).not.toHaveBeenCalled();
    await user.click(within(choices).getByRole('button', { name: /^Restore code(?! and)/u }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('src/build.ts');
    expect(confirm).toHaveTextContent('The conversation stays as it is.');
    expect(rewindLocalThread).toHaveBeenLastCalledWith(
      expect.objectContaining({ restore: 'code', preview: true }),
    );
    await user.click(within(confirm).getByRole('button', { name: 'Restore code' }));
    await waitFor(() => expect(onRewound).toHaveBeenCalledWith('code', 'turn-1'));
    expect(rewindLocalThread).toHaveBeenLastCalledWith({
      rootId: WORKTREE_ROOT,
      threadId: 'thread-1',
      turnId: 'turn-1',
      restore: 'code',
    });
    expect(await screen.findByText('Restored 1 file.')).toBeInTheDocument();
  });

  it('says a conversation-only rewind cannot be recovered and leaves the files', async () => {
    const user = userEvent.setup();
    rewindLocalThread.mockResolvedValueOnce({
      threadId: 'thread-1',
      turnId: 'turn-1',
      preview: true,
      files: [],
      messagesRemoved: 3,
    });
    render(<Harness canChooseRestore />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /^Restore conversation/u,
      }),
    );

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      '3 messages are removed from the conversation and cannot be recovered.',
    );
    expect(confirm).toHaveTextContent('Every file stays as it is now');
  });

  it('offers only the code once the conversation was condensed past the turn', async () => {
    const user = userEvent.setup();
    render(<Harness canChooseRestore />);

    await user.click(await screen.findByRole('button', { name: 'Rewind to before this turn' }));
    const choices = await screen.findByRole('dialog');

    expect(within(choices).getByText(/condensed after this turn/u)).toBeInTheDocument();
    expect(
      within(choices).getByRole('button', { name: /^Restore code(?! and)/u }),
    ).toBeInTheDocument();
    expect(within(choices).queryByRole('button', { name: /^Restore conversation/u })).toBeNull();
    expect(
      within(choices).queryByRole('button', { name: /^Restore code and conversation/u }),
    ).toBeNull();
  });

  it('summarizes from a turn only after naming what the model keeps and what stops rewinding', async () => {
    const user = userEvent.setup();
    const onSummarized = vi.fn();
    compactDeveloperThread.mockResolvedValueOnce({
      threadId: 'thread-1',
      compacted: true,
      messagesSummarized: 4,
      tokensBefore: 9000,
      tokensAfter: 1200,
    });
    render(<Harness canSummarize onSummarized={onSummarized} />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));
    const choices = await screen.findByRole('dialog');
    expect(within(choices).queryByRole('button', { name: /^Restore code(?! and)/u })).toBeNull();
    await user.click(within(choices).getByRole('button', { name: /^Summarize from here/u }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('The messages stay in the transcript');
    expect(confirm).toHaveTextContent('can no longer be rewound');
    expect(compactDeveloperThread).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Summarize' }));

    await waitFor(() => expect(onSummarized).toHaveBeenCalled());
    expect(compactDeveloperThread).toHaveBeenCalledWith({
      rootId: WORKTREE_ROOT,
      threadId: 'thread-1',
      fromTurnId: 'turn-1',
    });
    expect(await screen.findByText('Summarized 4 messages.')).toBeInTheDocument();
  });

  it('says plainly when there was nothing to summarize', async () => {
    const user = userEvent.setup();
    const onSummarized = vi.fn();
    compactDeveloperThread.mockResolvedValueOnce({
      threadId: 'thread-1',
      compacted: false,
      messagesSummarized: 0,
      tokensBefore: 900,
      tokensAfter: 900,
    });
    render(<Harness canSummarize canChooseRestore onSummarized={onSummarized} />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /^Summarize from here/u,
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Summarize' }),
    );

    expect(await screen.findByText(/Nothing was summarized/u)).toBeInTheDocument();
    expect(onSummarized).not.toHaveBeenCalled();
  });

  it('says why a turn past a compacted conversation cannot rewind, and does nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Rewind to before this turn' }));

    expect(await screen.findByText(/condensed after this turn/u)).toBeInTheDocument();
    expect(rewindLocalThread).not.toHaveBeenCalled();
  });

  it('previews apply-to-local, names the files, and applies on confirmation', async () => {
    const user = userEvent.setup();
    applyLocalWorktree
      .mockResolvedValueOnce({
        applied: ['src/build.ts'],
        skipped: [],
        conflicted: [],
        preview: true,
      })
      .mockResolvedValueOnce({
        applied: ['src/build.ts'],
        skipped: [],
        conflicted: ['README.md'],
        preview: false,
      });
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Apply to local' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('src/build.ts');
    expect(applyLocalWorktree).toHaveBeenLastCalledWith(WORKTREE_ROOT, true);

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applyLocalWorktree).toHaveBeenLastCalledWith(WORKTREE_ROOT, false));
    expect(await screen.findByText(/left alone because you changed it here/u)).toBeInTheDocument();
  });

  it('runs an unapproved setup script only after asking, then streams its output', async () => {
    const user = userEvent.setup();
    runLocalWorktreeSetup.mockResolvedValue(true);
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Run setup' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('.agiworkforce/worktree-setup');
    expect(runLocalWorktreeSetup).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(runLocalWorktreeSetup).toHaveBeenCalledWith(WORKTREE_ROOT, 'f00d'));

    act(() =>
      emit?.(WORKTREE_ROOT, {
        type: 'worktree-setup-finished',
        threadId: 'thread-1',
        worktreeId: '0a1b2c3d',
        exitCode: 1,
        succeeded: false,
      }),
    );
    expect(await screen.findByText('Setup failed with exit code 1.')).toBeInTheDocument();
  });

  it('says which large files a turn did not save, with the full list in a disclosure', async () => {
    const user = userEvent.setup();
    listLocalCheckpoints.mockResolvedValue({
      ...checkpoints,
      turns: checkpoints.turns.map((turn) =>
        turn.turnId === 'turn-2'
          ? { ...turn, skippedFiles: ['assets/model.bin', 'data/dump.sqlite'] }
          : turn,
      ),
    });
    render(<Harness />);

    expect(
      await screen.findByRole('button', { name: /Turn 2.*2 large files not saved/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Turn 1/u })).not.toHaveTextContent(/not saved/u);
    const notice = await screen.findByTestId('local-review-skipped');
    expect(notice).toHaveTextContent(
      '2 large files were not saved in this checkpoint and will not be restored.',
    );
    await user.click(within(notice).getByText('Files not saved'));
    expect(within(notice).getByText(/assets\/model\.bin/u)).toBeVisible();
    expect(within(notice).getByText(/data\/dump\.sqlite/u)).toBeVisible();
  });

  it('names the large files a rewind leaves alone, before and after it runs', async () => {
    const user = userEvent.setup();
    const rewound = {
      threadId: 'thread-1',
      turnId: 'turn-1',
      files: ['src/build.ts'],
      skippedFiles: ['assets/model.bin'],
      messagesRemoved: 2,
    };
    rewindLocalThread
      .mockResolvedValueOnce({ ...rewound, preview: true })
      .mockResolvedValueOnce({ ...rewound, preview: false });
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: /Turn 1/u }));
    await user.click(screen.getByRole('button', { name: 'Rewind to before this turn' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'assets/model.bin was too large to save in a checkpoint and will not be restored.',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Rewind' }));
    expect(
      await screen.findByText(
        '1 large file was not saved in this checkpoint and will not be restored.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Files not saved').length).toBeGreaterThan(0);
  });

  it('says nothing about skipped files when a CLI reports none', async () => {
    render(<Harness />);

    await screen.findByRole('button', { name: /Turn 2/u });
    expect(screen.queryByTestId('local-review-skipped')).not.toBeInTheDocument();
    expect(screen.queryByText(/not saved/u)).not.toBeInTheDocument();
  });

  it('shows no worktree controls for a session in the folder itself', async () => {
    render(<Harness withWorktree={false} />);

    await screen.findByRole('button', { name: /Turn 2/u });
    expect(screen.queryByRole('button', { name: 'Apply to local' })).not.toBeInTheDocument();
  });
});
