import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVELOPER_RUNTIME_CAPABILITIES,
  DesktopRuntimeError,
  type DeveloperRuntimeCapability,
  type DeveloperRuntimeModels,
  type DeveloperSessionEvent,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import { IME_PROCESSING_KEY_CODE } from '@agiworkforce/unified-chat/ime-composition';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { LOCAL_CODE_COPY } from '../local-code';

const readDeveloperSession = vi.fn();
const startDeveloperTurn = vi.fn();
const steerDeveloperTurn = vi.fn();
const interruptDeveloperTurn = vi.fn();
const answerDeveloperApproval = vi.fn();
const answerDeveloperUserInput = vi.fn();
const listWorkspaceFiles = vi.fn();
const deleteDeveloperThread = vi.fn();
const forkDeveloperThread = vi.fn();
const compactDeveloperThread = vi.fn();
const cancelDeveloperThreadSummary = vi.fn();
const archiveDeveloperThread = vi.fn();
const takeOverDeveloperThread = vi.fn();
const listeners = new Set<(rootId: string, event: DeveloperSessionEvent) => void>();
let capabilities: ReadonlySet<DeveloperRuntimeCapability> = new Set(DEVELOPER_RUNTIME_CAPABILITIES);
const capabilityReads: unknown[] = [];

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readDeveloperSession,
  startDeveloperTurn,
  steerDeveloperTurn,
  interruptDeveloperTurn,
  answerDeveloperApproval,
  answerDeveloperUserInput,
  listWorkspaceFiles,
  deleteDeveloperThread,
  forkDeveloperThread,
  compactDeveloperThread,
  cancelDeveloperThreadSummary,
  archiveDeveloperThread,
  takeOverDeveloperThread,
  cancelLocalCommand: vi.fn(),
  readWorkspaceText: vi.fn(),
  startLocalCommand: vi.fn(),
  openWorkspaceInEditor: vi.fn(async () => true),
  useDeveloperCapabilities: (refreshKey?: unknown) => {
    capabilityReads.push(refreshKey);
    return capabilities;
  },
  onDeveloperSessionEvent: (listener: (rootId: string, event: DeveloperSessionEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
}));

const { LocalSessionPanel } = await import('./LocalSessionPanel');
const { forgetLocalSession } = await import('../local-session-memory');

const MODE_KEY = 'agi.code.local.agentMode.thread-1';
const CYCLE_KEYS = '{Control>}{Shift>}M{/Shift}{/Control}';

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

function renderPanel(
  extra: Partial<Pick<Parameters<typeof LocalSessionPanel>[0], 'group' | 'onForked'>> = {},
) {
  return render(
    <LocalSessionPanel
      session={session}
      group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
      runtimeModels={runtime}
      verbose={false}
      onClose={vi.fn()}
      {...extra}
    />,
  );
}

function send(event: DeveloperSessionEvent) {
  act(() => {
    for (const listener of listeners) listener('root-1', event);
  });
}

function composer() {
  return within(screen.getByTestId('local-code-composer'));
}

async function startRunningTurn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(composer().getByRole('textbox'), 'long job{Enter}');
  await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalled());
  send({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetLocalSession('root-1', 'thread-1');
  window.localStorage.clear();
  useSettingsStore.setState({ codeFollowUpQueueMode: 'steer' });
  capabilities = new Set(DEVELOPER_RUNTIME_CAPABILITIES);
  capabilityReads.length = 0;
  readDeveloperSession.mockResolvedValue({
    session,
    messages: [],
    truncated: false,
    activeTurn: null,
  });
  startDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
  steerDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
  answerDeveloperApproval.mockResolvedValue(true);
  answerDeveloperUserInput.mockResolvedValue(true);
  listWorkspaceFiles.mockResolvedValue([]);
});

describe('local session capabilities', () => {
  // The shell narrows its list only after the CLI's handshake, which the load
  // itself starts, so the list is read again once the load has finished.
  it('reads the capabilities again once the session has loaded', async () => {
    let finishLoad: (value: unknown) => void = () => undefined;
    readDeveloperSession.mockReturnValue(
      new Promise((resolve) => {
        finishLoad = resolve;
      }),
    );
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    const keysWhileLoading = new Set(capabilityReads);

    await act(async () => {
      finishLoad({ session, messages: [], truncated: false, activeTurn: null });
    });

    await waitFor(() =>
      expect(capabilityReads.some((key) => !keysWhileLoading.has(key))).toBe(true),
    );
  });
});

describe('local session permissions', () => {
  it('names the posture on every turn, and remembers it for the thread', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(composer().getByRole('button', { name: 'Permissions: Ask' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^Plan/ }));
    await user.type(composer().getByRole('textbox'), 'look{Enter}');

    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'look', agentMode: 'plan' }),
      ),
    );
    expect(window.localStorage.getItem(MODE_KEY)).toBe('plan');
  });

  // The shell confirms Bypass in its own dialog before the first such turn, so
  // the page asks nothing of its own and only names the posture on the turn.
  it('leaves confirming bypass to the shell, names it on the turn, and never saves it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(MODE_KEY, 'auto');
    renderPanel();

    await user.click(composer().getByRole('button', { name: 'Permissions: Auto' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^Bypass permissions/ }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(startDeveloperTurn).not.toHaveBeenCalled();

    await user.type(composer().getByRole('textbox'), 'go{Enter}');

    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ agentMode: 'bypass' }),
      ),
    );
    expect(window.localStorage.getItem(MODE_KEY)).toBe('auto');
  });

  it('puts the picker and the message back when bypass is declined in the shell', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(MODE_KEY, 'auto');
    startDeveloperTurn.mockRejectedValueOnce(
      new DesktopRuntimeError({
        code: 'cancelled',
        message: 'The turn was not sent with Bypass permissions.',
      }),
    );
    renderPanel();

    await user.click(composer().getByRole('button', { name: 'Permissions: Auto' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /^Bypass permissions/ }));
    await user.type(composer().getByRole('textbox'), 'delete the build folder{Enter}');

    expect(
      await composer().findByRole('button', { name: 'Permissions: Auto' }),
    ).toBeInTheDocument();
    expect(composer().getByRole('textbox')).toHaveValue('delete the build folder');
    expect(screen.getByText(/Bypass permissions was not allowed/)).toBeInTheDocument();
    expect(screen.queryByText(/It is at the head of the queue/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.type(composer().getByRole('textbox'), '{Enter}');
    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(2));
    expect(startDeveloperTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'delete the build folder', agentMode: 'auto' }),
    );
  });

  it('steps Ask, Auto, Plan on Ctrl+Shift+M in the message box, sends it, and never reaches bypass', async () => {
    const user = userEvent.setup();
    renderPanel();
    const box = composer().getByRole('textbox');
    await user.click(box);

    await user.keyboard(CYCLE_KEYS);
    expect(composer().getByRole('button', { name: 'Permissions: Auto' })).toBeInTheDocument();
    expect(screen.getByText('Permissions: Auto')).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');

    await user.keyboard(CYCLE_KEYS);
    expect(composer().getByRole('button', { name: 'Permissions: Plan' })).toBeInTheDocument();
    await user.keyboard(CYCLE_KEYS);
    expect(composer().getByRole('button', { name: 'Permissions: Ask' })).toBeInTheDocument();
    await user.keyboard(CYCLE_KEYS);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.localStorage.getItem(MODE_KEY)).toBe('auto');
    await user.type(box, 'go{Enter}');
    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ agentMode: 'auto' }),
      ),
    );
  });

  it('leaves Shift+Tab to move focus back out of the message box', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(composer().getByRole('textbox'));

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(composer().getByRole('textbox')).not.toHaveFocus();
    expect(composer().getByRole('button', { name: 'Permissions: Ask' })).toBeInTheDocument();
    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });

  it('names the shortcut on the permissions control', () => {
    renderPanel();

    expect(composer().getByRole('button', { name: 'Permissions: Ask' })).toHaveAttribute(
      'title',
      expect.stringContaining('Ctrl+Shift+M'),
    );
  });

  it('does nothing on the shortcut when the CLI cannot take a posture', async () => {
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'agent_mode'),
    );
    const user = userEvent.setup();
    renderPanel();
    await user.click(composer().getByRole('textbox'));

    await user.keyboard(CYCLE_KEYS);

    expect(window.localStorage.getItem(MODE_KEY)).toBeNull();
  });
});

describe('summarizing a local session', () => {
  it('asks first, naming what is replaced, then summarizes and reloads the transcript', async () => {
    compactDeveloperThread.mockResolvedValue({
      threadId: 'thread-1',
      compacted: true,
      messagesSummarized: 12,
      tokensBefore: 48_000,
      tokensAfter: 9_000,
    });
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Summarize conversation' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('You still see every message here');
    expect(dialog).toHaveTextContent('cannot be undone');
    expect(dialog).toHaveTextContent('can no longer be rewound to');
    expect(compactDeveloperThread).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Summarize' }));

    await waitFor(() =>
      expect(compactDeveloperThread).toHaveBeenCalledWith({
        rootId: 'root-1',
        threadId: 'thread-1',
      }),
    );
    expect(
      await screen.findByText('Summarized the conversation, from about 48K to 9K tokens.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(2));
  });

  it('can be cancelled while it runs, and then says the conversation is unchanged', async () => {
    let stop: (reason: Error) => void = () => undefined;
    compactDeveloperThread.mockReturnValue(
      new Promise((_resolve, reject) => {
        stop = reject;
      }),
    );
    cancelDeveloperThreadSummary.mockImplementation(async () => {
      stop(new Error('Summarizing this session was stopped. Nothing in it changed.'));
      return true;
    });
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Summarize conversation' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Summarize' }),
    );
    expect(await screen.findByText('Summarizing the conversation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(cancelDeveloperThreadSummary).toHaveBeenCalledWith('root-1', 'thread-1');
    expect(
      await screen.findByText('Summarizing was cancelled. The conversation is unchanged.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Summarizing the conversation')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(readDeveloperSession).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the summary is declined', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Summarize conversation' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(compactDeveloperThread).not.toHaveBeenCalled();
  });

  it('is not offered by a CLI that cannot summarize a session', async () => {
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'thread_compact'),
    );
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: 'Summarize conversation' })).toBeNull();
  });
});

describe('branching a local session from a turn', () => {
  const forked: LocalDeveloperSession = { ...session, id: 'thread-2', title: 'Fix the build' };

  beforeEach(() => {
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [
        { role: 'user', text: 'first ask', turnId: 'turn-1' },
        { role: 'assistant', text: 'done', turnId: 'turn-1' },
        { role: 'user', text: 'second ask', turnId: 'turn-2' },
        { role: 'assistant', text: 'also done', turnId: 'turn-2' },
      ],
      truncated: false,
      activeTurn: null,
    });
  });

  it('starts a new session through the chosen turn and opens it', async () => {
    forkDeveloperThread.mockResolvedValue(forked);
    const onForked = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onForked });

    const branches = await screen.findAllByRole('button', { name: 'Branch from here' });
    expect(branches).toHaveLength(2);
    await user.click(branches[0] as HTMLElement);

    await waitFor(() => expect(onForked).toHaveBeenCalledWith(forked));
    expect(forkDeveloperThread).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      throughTurnId: 'turn-1',
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says so when the branch could not be made, and stays on this session', async () => {
    forkDeveloperThread.mockRejectedValue(new Error('boom'));
    const onForked = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onForked });

    const [first] = await screen.findAllByRole('button', { name: 'Branch from here' });
    await user.click(first as HTMLElement);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onForked).not.toHaveBeenCalled();
  });

  it('is not offered by a CLI that cannot cut the copy at a turn, or in a worktree', async () => {
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'thread_fork'),
    );
    const { unmount } = renderPanel({ onForked: vi.fn() });
    await screen.findByText('first ask');
    expect(screen.queryByRole('button', { name: 'Branch from here' })).toBeNull();
    unmount();

    capabilities = new Set(DEVELOPER_RUNTIME_CAPABILITIES);
    renderPanel({
      onForked: vi.fn(),
      group: {
        name: 'qa-project',
        branch: 'main',
        sessions: [session],
        worktree: {
          id: '0a1b2c3d',
          rootId: 'root-1',
          path: '/work/qa-worktree',
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
      },
    });
    await screen.findByText('first ask');
    expect(screen.queryByRole('button', { name: 'Branch from here' })).toBeNull();
  });
});

describe('local session follow-ups', () => {
  it('steers Enter into the running turn and queues Cmd+Shift+Enter', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);

    const textbox = composer().getByRole('textbox');
    expect(textbox).toBeEnabled();
    await user.type(textbox, 'use the other file{Enter}');
    await waitFor(() =>
      expect(steerDeveloperTurn).toHaveBeenCalledWith({
        rootId: 'root-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        text: 'use the other file',
      }),
    );

    await user.type(textbox, 'then run the tests');
    await user.keyboard('{Control>}{Meta>}{Shift>}{Enter}{/Shift}{/Meta}{/Control}');

    const queue = await screen.findByTestId('local-queue');
    expect(queue).toHaveTextContent('then run the tests');
    expect(steerDeveloperTurn).toHaveBeenCalledTimes(1);
  });

  it('lets a queued message be edited and removed before it is sent', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ codeFollowUpQueueMode: 'queue' });
    renderPanel();
    await startRunningTurn(user);

    await user.type(composer().getByRole('textbox'), 'first draft{Enter}');
    const row = await screen.findByTestId('local-queued-message');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const field = within(row).getByRole('textbox', { name: 'Queued message' });
    await user.clear(field);
    await user.type(field, 'second draft');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(row).toHaveTextContent('second draft');

    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByTestId('local-queue')).not.toBeInTheDocument();
    expect(steerDeveloperTurn).not.toHaveBeenCalled();
  });
});

describe('sending a failed turn again', () => {
  const FAILED = {
    type: 'turn-finished',
    threadId: 'thread-1',
    turnId: 'turn-9',
    outcome: 'failed',
    response: '',
    failure: {
      code: 'unknown',
      message: 'The model did not answer in time.',
      provider: null,
      action: 'retry',
      retryable: true,
    },
    inputTokens: 0,
    outputTokens: 0,
  } as const;

  it('resends what was asked in a turn this page did not start, from the stored conversation', async () => {
    const user = userEvent.setup();
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [
        { role: 'user', text: 'an older ask', turnId: 'turn-8' },
        { role: 'assistant', text: 'done', turnId: 'turn-8' },
        { role: 'user', text: 'asked from the terminal', turnId: 'turn-9' },
      ],
      truncated: false,
      activeTurn: { turnId: 'turn-9', partialResponse: '', approvals: [], questions: [] },
    });
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await screen.findByText('asked from the terminal');

    send(FAILED);
    await user.click(await screen.findByRole('button', { name: 'Send it again' }));

    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'asked from the terminal' }),
      ),
    );
  });

  it('offers no resend when this page never saw what was asked', async () => {
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-9' });
    send(FAILED);

    expect(await screen.findByText(/did not answer in time/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send it again' })).not.toBeInTheDocument();
  });
});

describe('local session keys', () => {
  it('does not send on the Enter that confirms an IME word', async () => {
    const user = userEvent.setup();
    renderPanel();
    const textbox = composer().getByRole('textbox');
    await user.type(textbox, 'nihon');

    fireEvent.keyDown(textbox, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(textbox, { key: 'Enter', keyCode: 229 });

    expect(startDeveloperTurn).not.toHaveBeenCalled();
    expect(textbox).toHaveValue('nihon');

    fireEvent.keyDown(textbox, { key: 'Enter' });
    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(1));
  });

  it('sends once when Enter is pressed again before the composer has cleared', async () => {
    const user = userEvent.setup();
    renderPanel();
    const textbox = composer().getByRole('textbox');
    await user.type(textbox, 'ship it');

    fireEvent.keyDown(textbox, { key: 'Enter' });
    fireEvent.keyDown(textbox, { key: 'Enter' });

    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textbox).toHaveValue(''));
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/queued to send after it/)).not.toBeInTheDocument();
  });

  it('stops the running turn on Escape and keeps what it did', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);

    const textbox = composer().getByRole('textbox');
    textbox.focus();
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1'),
    );
    expect(composer().getByRole('button', { name: 'Stop' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Escape',
    );
  });

  it('takes queued messages back into an empty message box on ArrowUp', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ codeFollowUpQueueMode: 'queue' });
    renderPanel();
    await startRunningTurn(user);

    const textbox = composer().getByRole('textbox');
    await user.type(textbox, 'first{Enter}');
    await user.type(textbox, 'second{Enter}');
    expect(await screen.findAllByTestId('local-queued-message')).toHaveLength(2);

    await user.keyboard('{ArrowUp}');

    expect(textbox).toHaveValue('first\nsecond');
    expect(screen.queryByTestId('local-queue')).not.toBeInTheDocument();
  });
});

describe('local session approvals', () => {
  const approval = {
    type: 'approval-requested',
    threadId: 'thread-1',
    turnId: 'turn-1',
    requestId: 'ask-1',
    kind: 'Exec',
    summary: 'Run the build',
    detail: '',
    command: 'pnpm build',
    riskLevel: 'high',
    reversible: false,
  } as const satisfies DeveloperSessionEvent;

  it('offers only allow and deny on a shell that reads nothing else', async () => {
    const user = userEvent.setup();
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'approval_decisions'),
    );
    renderPanel();
    await startRunningTurn(user);
    send(approval);

    const card = within(await screen.findByTestId('local-approval'));
    expect(card.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Allow once',
      'Deny (Esc)',
    ]);
  });

  it('shows the command, folder and risk, and answers while the turn waits', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send(approval);

    const card = await screen.findByTestId('local-approval');
    expect(within(card).getByRole('button', { name: 'Allow once' })).toBeEnabled();
    expect(card).toHaveTextContent('pnpm build');
    expect(card).toHaveTextContent('Folder: /work/qa-project');
    expect(card).toHaveTextContent('High risk');
    expect(card).toHaveTextContent('Cannot be undone');

    await user.click(within(card).getByRole('button', { name: 'Deny and stop' }));
    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'deny_and_stop',
    });
  });

  it('offers no always-allow rule for a command the CLI proposed none for', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send(approval);

    const card = await screen.findByTestId('local-approval');
    expect(within(card).getByRole('button', { name: 'Allow once' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Always allow' })).toBeNull();
  });

  it('answers a question the agent asks for approval with the option chosen', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send({
      ...approval,
      requestId: 'ask-2',
      summary: 'The agent has a question',
      command: null,
      riskLevel: null,
      reversible: null,
      question: { question: 'Which suite?', options: ['unit', 'e2e'] },
    });

    const prompt = await screen.findByRole('group', { name: 'Which suite?' });
    expect(screen.queryByTestId('local-approval')).not.toBeInTheDocument();
    await user.click(within(prompt).getByRole('button', { name: 'e2e' }));

    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-2',
      decision: 'approve_once',
      note: 'e2e',
    });
  });

  it('confirms an always-allow rule, naming the command it lets run everywhere', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send({ ...approval, proposedCommandPrefix: ['pnpm', 'build'] });

    const card = await screen.findByTestId('local-approval');
    await user.click(within(card).getByRole('button', { name: 'Always allow' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('starts with "pnpm build"');
    expect(dialog).toHaveTextContent('in every folder on this computer');
    expect(answerDeveloperApproval).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Always allow' }));
    await waitFor(() =>
      expect(answerDeveloperApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'always_allow_command',
          commandPrefix: ['pnpm', 'build'],
        }),
      ),
    );
  });
});

describe('local session questions', () => {
  const asked = {
    type: 'user-input-requested',
    threadId: 'thread-1',
    turnId: 'turn-1',
    requestId: 'q-1',
    question: 'Which branch should I push to?',
  } as const satisfies DeveloperSessionEvent;

  it('shows the question mid-turn and sends the typed answer', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send(asked);

    const card = await screen.findByTestId('local-question');
    expect(card).toHaveTextContent('Which branch should I push to?');
    await user.type(within(card).getByRole('textbox', { name: 'Your answer' }), 'main');
    await user.click(within(card).getByRole('button', { name: 'Send answer' }));

    expect(answerDeveloperUserInput).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      answer: 'main',
    });
  });

  it('shows a question that was already waiting when the session was opened', async () => {
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [],
      truncated: false,
      activeTurn: {
        turnId: 'turn-live',
        partialResponse: '',
        approvals: [],
        questions: [{ requestId: 'q-1', question: 'Which branch should I push to?' }],
      },
    });
    renderPanel();

    const card = await screen.findByTestId('local-question');
    expect(card).toHaveTextContent('Which branch should I push to?');
  });

  it('skips a question as no answer, and drops the card once the CLI says so', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);
    send(asked);

    const card = await screen.findByTestId('local-question');
    await user.click(within(card).getByRole('button', { name: 'Skip' }));
    expect(answerDeveloperUserInput).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'q-1', answer: null }),
    );

    send({
      type: 'user-input-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      cancelled: true,
    });
    expect(screen.queryByTestId('local-question')).not.toBeInTheDocument();
  });
});

describe('local session changes', () => {
  it('renders the turn diff file by file and keeps it after the turn completes', async () => {
    const user = userEvent.setup();
    renderPanel();
    await startRunningTurn(user);

    send({
      type: 'turn-diff',
      threadId: 'thread-1',
      turnId: 'turn-1',
      unifiedDiff:
        'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
      paths: ['src/a.ts'],
    });
    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'completed',
      response: 'done',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });

    const changes = await screen.findByTestId('local-turn-changes');
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(2));
    expect(changes).toHaveTextContent('Changed 1 file');
    expect(changes).toHaveTextContent('src/a.ts');
    expect(changes).toHaveTextContent('+new');
    expect(screen.getByTestId('local-turn-changes')).toBeInTheDocument();
  });
});

describe('local session attachments', () => {
  it('sends files picked from the folder as context, by path', async () => {
    const user = userEvent.setup();
    listWorkspaceFiles.mockImplementation(async (_rootId: string, path: string) =>
      path === ''
        ? [
            { name: 'src', path: 'src', kind: 'directory', sizeBytes: 0, modifiedAtMs: 0 },
            { name: 'README.md', path: 'README.md', kind: 'file', sizeBytes: 9, modifiedAtMs: 0 },
          ]
        : [{ name: 'a.ts', path: 'src/a.ts', kind: 'file', sizeBytes: 9, modifiedAtMs: 0 }],
    );
    renderPanel();

    await user.click(composer().getByRole('button', { name: 'Add a file from this folder' }));
    await user.click(await screen.findByRole('menuitem', { name: 'src' }));
    await user.click(await screen.findByRole('menuitem', { name: 'a.ts' }));
    expect(composer().getByText('src/a.ts')).toBeInTheDocument();

    await user.type(composer().getByRole('textbox'), 'explain{Enter}');
    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'explain', contextFiles: ['src/a.ts'] }),
      ),
    );
  });

  it('queues a follow-up that has a folder file attached, rather than steering it without the file', async () => {
    const user = userEvent.setup();
    listWorkspaceFiles.mockResolvedValue([
      { name: 'README.md', path: 'README.md', kind: 'file', sizeBytes: 9, modifiedAtMs: 0 },
    ]);
    renderPanel();
    await startRunningTurn(user);

    await user.click(composer().getByRole('button', { name: 'Add a file from this folder' }));
    await user.click(await screen.findByRole('menuitem', { name: 'README.md' }));
    expect(composer().getByRole('textbox')).toHaveAccessibleName('Queue a follow-up');
    await user.type(composer().getByRole('textbox'), 'read this too{Enter}');

    expect(await screen.findByTestId('local-queue')).toHaveTextContent('read this too');
    expect(steerDeveloperTurn).not.toHaveBeenCalled();
  });

  it('falls back to plain turns on a shell that predates these features', async () => {
    const user = userEvent.setup();
    capabilities = new Set();
    renderPanel();

    expect(composer().queryByRole('button', { name: /^Permissions:/ })).toBeNull();
    expect(composer().queryByRole('button', { name: /^Reasoning/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review changes' })).toBeNull();
    await user.type(composer().getByRole('textbox'), 'look{Enter}');
    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(1));
    const [request] = startDeveloperTurn.mock.calls[0] as [Record<string, unknown>];
    expect(request).not.toHaveProperty('agentMode');
    expect(request).not.toHaveProperty('reasoningEffort');
    expect(request).not.toHaveProperty('contextFiles');

    send({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    await user.type(composer().getByRole('textbox'), 'and then this{Enter}');
    expect(await screen.findByTestId('local-queue')).toHaveTextContent('and then this');
    expect(steerDeveloperTurn).not.toHaveBeenCalled();
  });

  it('refuses a pasted file that is not an image, saying what to do instead', async () => {
    const user = userEvent.setup();
    renderPanel();

    const textbox = composer().getByRole('textbox');
    await user.click(textbox);
    await user.paste({
      files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })],
    } as unknown as DataTransfer);

    expect(
      await screen.findByText(
        'Only images can be pasted into a coding session. Add other files from this folder.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses a pasted image on a shell that does not report images, saying to update', async () => {
    const user = userEvent.setup();
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'images'),
    );
    renderPanel();

    const textbox = composer().getByRole('textbox');
    await user.click(textbox);
    await user.paste({
      files: [new File(['x'], 'shot.png', { type: 'image/png' })],
    } as unknown as DataTransfer);

    expect(
      await screen.findByText(
        'Pasting images into a coding session needs a newer version of AGI Desktop. Update the app, then try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('deleting a local session', () => {
  function renderDeletable(onDeleted = vi.fn()) {
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onDeleted={onDeleted}
        onClose={vi.fn()}
      />,
    );
    return onDeleted;
  }

  it('asks first, naming what is lost and that worktree archives are kept', async () => {
    const user = userEvent.setup();
    const outcome = {
      acknowledged: true,
      keptWorktreeArchives: ['refs/agi/archive/a1'],
      removedWorktreeArchives: [],
      releasedWorktrees: [],
    };
    deleteDeveloperThread.mockResolvedValue(outcome);
    const onDeleted = renderDeletable();

    await user.click(screen.getByRole('button', { name: 'Delete session' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Fix the build is deleted from this computer');
    expect(dialog).toHaveTextContent('cannot be recovered');
    expect(dialog).toHaveTextContent('archives of worktrees it used');
    expect(deleteDeveloperThread).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete session' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(outcome));
    expect(deleteDeveloperThread).toHaveBeenCalledWith({ rootId: 'root-1', threadId: 'thread-1' });
  });

  it('stays open and says so when the delete fails', async () => {
    const user = userEvent.setup();
    deleteDeveloperThread.mockRejectedValue(new Error('A turn is running in this thread.'));
    const onDeleted = renderDeletable();

    await user.click(screen.getByRole('button', { name: 'Delete session' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete session',
      }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('offers no delete on a shell or CLI that cannot delete a session', () => {
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'thread_delete'),
    );
    renderDeletable();

    expect(screen.queryByRole('button', { name: 'Delete session' })).not.toBeInTheDocument();
  });
});

describe('archiving a local session', () => {
  function renderArchivable(onArchived = vi.fn()) {
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        onArchived={onArchived}
        onClose={vi.fn()}
      />,
    );
    return onArchived;
  }

  it('asks first, saying where the session goes and the command that brings it back', async () => {
    const user = userEvent.setup();
    archiveDeveloperThread.mockResolvedValue(true);
    const onArchived = renderArchivable();

    await user.click(screen.getByRole('button', { name: 'Archive session' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Fix the build leaves this list');
    expect(dialog).toHaveTextContent('agi session unarchive thread-1');
    expect(archiveDeveloperThread).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Archive session' }));
    await waitFor(() => expect(onArchived).toHaveBeenCalledTimes(1));
    expect(archiveDeveloperThread).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('stays open and says so when the archive fails', async () => {
    const user = userEvent.setup();
    archiveDeveloperThread.mockRejectedValue(new Error('Interrupt the running turn first.'));
    const onArchived = renderArchivable();

    await user.click(screen.getByRole('button', { name: 'Archive session' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Archive session',
      }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onArchived).not.toHaveBeenCalled();
  });

  it('offers no archive until the CLI has said it serves sessions', () => {
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'thread_archive'),
    );
    renderArchivable();

    expect(screen.queryByRole('button', { name: 'Archive session' })).not.toBeInTheDocument();
  });
});

describe('a session another program is writing', () => {
  const held = () =>
    new DesktopRuntimeError({
      code: 'thread-held',
      message: 'agi (pid 4242) is writing this session.',
    });

  it('offers a takeover that names who loses the session, then sends what was waiting', async () => {
    const user = userEvent.setup();
    startDeveloperTurn.mockRejectedValueOnce(held());
    takeOverDeveloperThread.mockResolvedValue(session);
    renderPanel();

    await user.type(composer().getByRole('textbox'), 'continue{Enter}');

    const notice = await screen.findByTestId('local-session-held');
    expect(notice).toHaveTextContent('agi (pid 4242) is writing this session.');
    expect(notice).toHaveTextContent('take the session over to continue here');

    await user.click(within(notice).getByRole('button', { name: 'Take over' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('that program loses the session');
    expect(dialog).toHaveTextContent('A turn it is already running still finishes');
    expect(takeOverDeveloperThread).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Take over' }));

    await waitFor(() => expect(takeOverDeveloperThread).toHaveBeenCalledWith('root-1', 'thread-1'));
    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(2));
    expect(startDeveloperTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'continue' }),
    );
    await waitFor(() => expect(screen.queryByTestId('local-session-held')).not.toBeInTheDocument());
  });

  it('leaves the session with that program when the takeover is not confirmed', async () => {
    const user = userEvent.setup();
    startDeveloperTurn.mockRejectedValueOnce(held());
    renderPanel();

    await user.type(composer().getByRole('textbox'), 'continue{Enter}');
    await user.click(
      within(await screen.findByTestId('local-session-held')).getByRole('button', {
        name: 'Take over',
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    expect(takeOverDeveloperThread).not.toHaveBeenCalled();
    expect(screen.getByTestId('local-session-held')).toBeInTheDocument();
  });

  it('says to wait, with no takeover, on a CLI without a writer lease', async () => {
    const user = userEvent.setup();
    capabilities = new Set(
      DEVELOPER_RUNTIME_CAPABILITIES.filter((capability) => capability !== 'thread_takeover'),
    );
    startDeveloperTurn.mockRejectedValueOnce(held());
    renderPanel();

    await user.type(composer().getByRole('textbox'), 'continue{Enter}');

    const notice = await screen.findByTestId('local-session-held');
    expect(notice).toHaveTextContent('then send your message again');
    expect(within(notice).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('worktree cleanup a new session reports', () => {
  it('names the older worktrees left in place without blocking the session', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        cleanupFailures={[
          { worktreeId: 'deadbeef', reason: 'the checkout is locked' },
          { worktreeId: 'cafef00d', reason: 'git could not archive it' },
        ]}
        onDismissCleanupFailures={onDismiss}
        onClose={vi.fn()}
      />,
    );

    const notice = screen.getByTestId('local-cleanup-failures');
    expect(notice).toHaveTextContent(
      '2 older worktrees could not be archived and are still on this computer.',
    );
    expect(notice).toHaveTextContent('This session runs in its new worktree.');
    await user.click(within(notice).getByText('Worktrees left in place'));
    expect(within(notice).getByText(/deadbeef: the checkout is locked/u)).toBeVisible();
    expect(composer().getByRole('textbox')).toBeEnabled();

    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('says so plainly when the worktrees could not be listed at all', () => {
    render(
      <LocalSessionPanel
        session={session}
        group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
        runtimeModels={runtime}
        verbose={false}
        cleanupFailures={[{ worktreeId: '', reason: 'git worktree list failed' }]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('local-cleanup-failures')).toHaveTextContent(
      'Older worktrees could not be checked for cleanup, so none were archived.',
    );
  });
});

describe('the local session composer during input-method composition', () => {
  async function composing(): Promise<HTMLElement> {
    renderPanel();
    const field = composer().getByRole('textbox', { name: LOCAL_CODE_COPY.composerPlaceholder });
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await userEvent.setup().type(field, 'テストを実行して');
    return field;
  }

  it('does not send on an Enter that reports isComposing', async () => {
    const field = await composing();

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });

    expect(startDeveloperTurn).not.toHaveBeenCalled();
    expect(field).toHaveValue('テストを実行して');
  });

  it('does not send on an Enter that carries the IME processing keycode', async () => {
    const field = await composing();

    fireEvent.keyDown(field, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(startDeveloperTurn).not.toHaveBeenCalled();
    expect(field).toHaveValue('テストを実行して');
  });

  it('sends once on the Enter that follows composition', async () => {
    const field = await composing();

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(1));
    expect(startDeveloperTurn).toHaveBeenCalledWith(
      expect.objectContaining({ rootId: 'root-1', threadId: 'thread-1', text: 'テストを実行して' }),
    );
  });
});

describe('the changes and review panes', () => {
  it('keeps one side pane open at a time', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    expect(screen.getAllByRole('complementary', { name: 'Changes' })).toHaveLength(1);
    expect(screen.queryByTestId('local-review-pane')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(await screen.findByTestId('local-review-pane')).toBeInTheDocument();
    expect(screen.getAllByRole('complementary', { name: 'Changes' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    expect(screen.queryByTestId('local-review-pane')).not.toBeInTheDocument();
    expect(screen.getAllByRole('complementary', { name: 'Changes' })).toHaveLength(1);
  });
});

describe('local session subagents', () => {
  it('groups the subagents a turn ran under a count, with each one’s state', async () => {
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [],
      truncated: false,
      activeTurn: null,
      childTasks: [
        {
          id: 'subagent_a',
          parentSessionId: 'thread-1',
          title: 'Read the tests',
          state: 'running',
        },
        { id: 'subagent_b', parentSessionId: 'thread-1', title: 'Map the API', state: 'completed' },
        { id: 'subagent_c', parentSessionId: 'thread-1', title: 'Check the docs', state: 'failed' },
      ],
    });
    renderPanel();

    const group = await screen.findByTestId('local-subagents');
    expect(within(group).getByText('Subagents (3) · 1 running · 1 done · 1 failed')).toBeTruthy();
    expect((group as HTMLDetailsElement).open).toBe(true);
    expect(group.querySelector('#local-child-subagent_a')?.textContent).toBe(
      'Read the tests · Running',
    );
    expect(group.querySelector('#local-child-subagent_b')?.textContent).toBe('Map the API · Done');
    expect(group.querySelector('#local-child-subagent_c')?.textContent).toBe(
      'Check the docs · Failed',
    );
  });

  it('stays folded once every subagent has finished', async () => {
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [],
      truncated: false,
      activeTurn: null,
      childTasks: [
        {
          id: 'subagent_a',
          parentSessionId: 'thread-1',
          title: 'Read the tests',
          state: 'completed',
        },
      ],
    });
    renderPanel();

    const group = await screen.findByTestId('local-subagents');
    expect((group as HTMLDetailsElement).open).toBe(false);
    expect(within(group).getByText('Subagents (1) · 1 done')).toBeTruthy();
  });

  it('shows no subagent group when the turn ran none', async () => {
    renderPanel();
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    expect(screen.queryByTestId('local-subagents')).toBeNull();
  });
});
