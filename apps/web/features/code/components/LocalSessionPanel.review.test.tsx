import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_RUNTIME_CAPABILITIES,
  type DeveloperRuntimeModels,
  type DeveloperSessionGroup,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';

const listLocalCheckpoints = vi.fn();
const deleteLocalWorktree = vi.fn();
const rewindLocalThread = vi.fn();
const readDeveloperSession = vi.fn();

vi.mock('../services/local-review-client', () => ({
  listLocalCheckpoints,
  readLocalCheckpointDiff: vi.fn(),
  revertLocalSections: vi.fn(),
  stageLocalSections: vi.fn(),
  rewindLocalThread,
  applyLocalWorktree: vi.fn(),
  deleteLocalWorktree,
  pinLocalWorktree: vi.fn(),
  runLocalWorktreeSetup: vi.fn(),
  localWorktreeKeep: vi.fn(),
}));

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readDeveloperSession,
  onDeveloperSessionEvent: () => () => undefined,
  useDeveloperCapabilities: () => new Set(DEVELOPER_RUNTIME_CAPABILITIES),
  listWorkspaceFiles: vi.fn(async () => [
    { name: 'README.md', path: 'README.md', kind: 'file', sizeBytes: 1, modifiedAtMs: 1 },
  ]),
  findWorkspaceFilesByName: vi.fn(async () => []),
}));

const { LocalSessionPanel } = await import('./LocalSessionPanel');
const { forgetLocalSession } = await import('../local-session-memory');

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Fix the build',
  cwd: '/work/qa-project',
  model: null,
  provider: null,
  trustMode: 'local',
  status: 'idle',
  createdAt: '2026-10-10T10:00:00Z',
  updatedAt: '2026-10-10T10:05:00Z',
  origin: 'desktop',
};

const runtime: DeveloperRuntimeModels = {
  models: [],
  hostModels: [],
  defaultModelId: null,
  defaultAgentMode: 'ask',
  defaultReasoningEffort: null,
  managedSignedIn: false,
};

const worktreeGroup: Pick<DeveloperSessionGroup, 'name' | 'branch' | 'sessions' | 'worktree'> = {
  name: 'qa-project · worktree 0a1b2c3d',
  branch: null,
  sessions: [{ ...session, rootId: 'root-1::worktree::0a1b2c3d' }],
  worktree: {
    id: '0a1b2c3d',
    rootId: 'root-1',
    path: '/home/qa/.agiworkforce/worktrees/qa/0a1b2c3d/checkout',
    label: null,
    start: { kind: 'ref', name: 'HEAD' },
    baseCommit: 'abc',
    createdAt: '2026-10-10T10:00:00Z',
    threadId: 'thread-1',
    pinned: false,
    active: true,
    missing: false,
    setupScript: null,
    setupExitCode: null,
    setupRanAt: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  forgetLocalSession('root-1', 'thread-1');
  forgetLocalSession('root-1::worktree::0a1b2c3d', 'thread-1');
  listLocalCheckpoints.mockResolvedValue({ threadId: 'thread-1', available: true, turns: [] });
  readDeveloperSession.mockResolvedValue({
    session: null,
    messages: [],
    truncated: false,
    activeTurn: null,
  });
});

describe('LocalSessionPanel review pane', () => {
  it('opens and closes on Ctrl+Shift+G, as the review pane does in ChatGPT', async () => {
    const user = userEvent.setup();
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('local-review-pane')).not.toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}G{/Shift}{/Control}');

    expect(await screen.findByTestId('local-review-pane')).toBeInTheDocument();
    await waitFor(() => expect(listLocalCheckpoints).toHaveBeenCalledWith('root-1', 'thread-1'));
    expect(
      await screen.findByText('No turn in this session has changed a file yet.'),
    ).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}G{/Shift}{/Control}');
    expect(screen.queryByTestId('local-review-pane')).not.toBeInTheDocument();
  });

  it('opens the files panel on Cmd+P with the cursor in the file search, and swaps it for the review pane', async () => {
    const user = userEvent.setup();
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument();

    await user.keyboard('{Meta>}p{/Meta}');

    const files = await screen.findByRole('complementary', { name: 'Files' });
    expect(await within(files).findByRole('button', { name: 'README.md' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Search files by name')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Control>}{Shift>}G{/Shift}{/Control}');
    expect(await screen.findByTestId('local-review-pane')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument();
  });

  it('opens the side panel on its shortcut list and closes whatever it shows', async () => {
    const user = userEvent.setup();
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );
    const sideToggle = screen.getByRole('button', { name: 'Side panel' });
    expect(sideToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /^Panel position/u })).not.toBeInTheDocument();

    await user.click(sideToggle);

    const list = screen.getByRole('complementary', { name: 'Panel shortcuts' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'ReviewCtrl+Shift+G',
      'TerminalCtrl+`',
      'FilesCtrl+P',
    ]);
    expect(sideToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(list).getByRole('button', { name: /^Files/u }));
    expect(await screen.findByRole('complementary', { name: 'Files' })).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Panel shortcuts' }),
    ).not.toBeInTheDocument();
    expect(sideToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(sideToggle);
    expect(screen.queryByRole('complementary', { name: 'Files' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Panel shortcuts' }),
    ).not.toBeInTheDocument();
    expect(sideToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('docks a terminal for the folder below the conversation and toggles it on Ctrl+`', async () => {
    const user = userEvent.setup();
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );
    const bottomToggle = screen.getByRole('button', { name: 'Terminal panel' });
    expect(screen.queryByTestId('local-terminal-dock')).not.toBeInTheDocument();

    await user.click(bottomToggle);

    const dock = screen.getByTestId('local-terminal-dock');
    expect(dock).toBeVisible();
    expect(bottomToggle).toHaveAttribute('aria-pressed', 'true');
    expect(within(dock).getByRole('tab', { name: 'qa-project' })).toBeInTheDocument();
    expect(within(dock).getByText('qa-project %')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Side panel' }));
    expect(screen.getByRole('complementary', { name: 'Panel shortcuts' })).toBeInTheDocument();

    await user.keyboard('{Control>}`{/Control}');
    expect(dock).not.toBeVisible();
    expect(bottomToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('complementary', { name: 'Panel shortcuts' })).toBeInTheDocument();

    await user.keyboard('{Control>}`{/Control}');
    expect(dock).toBeVisible();
  });

  it('offers no terminal over SSH, where the host terminal is unavailable', () => {
    render(
      <LocalSessionPanel
        session={{ ...session, environment: 'ssh' }}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Terminal panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Side panel' })).not.toBeInTheDocument();
  });

  it('keeps the folder controls in a worktree, which its folder grant covers', () => {
    render(
      <LocalSessionPanel
        session={{ ...session, rootId: 'root-1::worktree::0a1b2c3d' }}
        group={worktreeGroup}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in VS Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run tests' })).toBeInTheDocument();
  });

  it('refreshes the list and hands over the ref that holds the removed work before closing', async () => {
    const user = userEvent.setup();
    const onSessionsChanged = vi.fn();
    const onWorktreeRemoved = vi.fn();
    const onClose = vi.fn();
    deleteLocalWorktree.mockResolvedValue({
      snapshotRef: 'refs/agiworkforce/worktree-archive/thread-1/0a1b2c3d',
    });
    render(
      <LocalSessionPanel
        session={{ ...session, rootId: 'root-1::worktree::0a1b2c3d' }}
        group={worktreeGroup}
        runtimeModels={runtime}
        verbose={false}
        onSessionsChanged={onSessionsChanged}
        onWorktreeRemoved={onWorktreeRemoved}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    await user.click(await screen.findByRole('button', { name: 'Remove worktree' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onSessionsChanged).toHaveBeenCalled());
    expect(deleteLocalWorktree).toHaveBeenCalledWith('root-1::worktree::0a1b2c3d');
    expect(onWorktreeRemoved).toHaveBeenCalledWith(
      'refs/agiworkforce/worktree-archive/thread-1/0a1b2c3d',
    );
    expect(onClose).toHaveBeenCalled();
    expect(onWorktreeRemoved.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0]!,
    );
  });

  it('rewinds from the transcript turn, naming the files first', async () => {
    const user = userEvent.setup();
    readDeveloperSession.mockResolvedValue({
      session: null,
      messages: [
        { role: 'user', text: 'first ask', turnId: 'turn-1' },
        { role: 'assistant', text: 'done', turnId: 'turn-1' },
        { role: 'user', text: 'second ask', turnId: 'turn-2' },
        { role: 'user', text: 'steered into it', turnId: 'turn-2' },
        { role: 'assistant', text: 'also done', turnId: 'turn-2' },
      ],
      truncated: false,
      activeTurn: null,
    });
    rewindLocalThread
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        turnId: 'turn-2',
        preview: true,
        files: ['src/app.ts'],
        messagesRemoved: 3,
      })
      .mockResolvedValueOnce({
        threadId: 'thread-1',
        turnId: 'turn-2',
        preview: false,
        files: ['src/app.ts'],
        messagesRemoved: 3,
        recoveryRef: 'refs/agiworkforce/rewound/thread-1/1',
      });
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onClose={vi.fn()}
      />,
    );

    const rewinds = await screen.findAllByRole('button', { name: 'Rewind to here' });
    expect(rewinds).toHaveLength(2);
    await user.click(rewinds[1]!);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /^Restore code and conversation/u,
      }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('src/app.ts');
    expect(dialog).toHaveTextContent('3 messages are removed');
    await user.click(within(dialog).getByRole('button', { name: 'Rewind' }));

    await waitFor(() =>
      expect(rewindLocalThread).toHaveBeenLastCalledWith({
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-2',
      }),
    );
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('local-code-composer').querySelector('textarea')).toHaveValue(
      'second ask',
    );
  });
});
