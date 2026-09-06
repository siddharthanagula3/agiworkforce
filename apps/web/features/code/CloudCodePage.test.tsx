import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoutingSlotModel,
  NOTEBOOK_TEMPLATE_ID,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { useUIStore } from '@shared/stores/layout-store';
import { TOOL_APPROVAL_POLICY_OPTIONS } from '@shared/types/toolApprovalPolicy';
import { CloudCodePage } from './CloudCodePage';
import type { CloudCodeApi } from './services/cloud-code-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/code',
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({
    children,
    narrowHeaderSlot,
    rail = true,
  }: {
    children: React.ReactNode;
    narrowHeaderSlot?: React.ReactNode;
    rail?: boolean;
  }) => (
    <div data-testid="web-app-shell" data-rail={String(rail)}>
      <div data-testid="app-bar">{narrowHeaderSlot}</div>
      {children}
    </div>
  ),
}));

let greetingName: string | undefined = 'Ada';
let greetingResolved = true;
vi.mock('@features/chat/components/GreetingBanner/useGreeting', () => ({
  useGreeting: () => ({
    headline: 'Good morning',
    firstName: greetingName,
    nameResolved: greetingResolved,
  }),
}));

vi.mock('@/features/notebook/NotebookPanel', () => ({
  NotebookPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="notebook-panel">{sessionId}</div>
  ),
}));

vi.mock('@features/chat/components/Composer/ComposerFooter', () => ({
  ComposerFooter: () => <div data-testid="model-trigger" />,
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        id: 'user-1',
        email: 'person@example.com',
        name: 'Ada Lovelace',
        profile: { display_name: 'Ada Lovelace', preferred_name: 'Ada' },
      },
      subscription: { display_name: 'Pro' },
    }),
}));

const session: CloudCodeSession = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Run the test suite',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'none',
  runtimeId: null,
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z',
  closedAt: null,
};

const availability = {
  deploymentEnabled: true,
  storageReady: true,
  planEntitled: true,
  planTier: 'pro',
  maxSessions: 5,
};

function createApi(overrides: Partial<CloudCodeApi> = {}): CloudCodeApi {
  return {
    list: vi.fn(async () => ({ availability, sessions: [], runtimes: [] })),
    get: vi.fn(async () => ({ session, terminalEntries: [] })),
    create: vi.fn(async () => ({ session, terminalEntries: [] })),
    run: vi.fn(async () => ({
      session,
      terminalEntry: {
        id: '1',
        sessionId: session.id,
        command: 'pwd',
        stdout: '/home/user\n',
        stderr: '',
        exitCode: 0,
        startedAt: '2026-07-30T12:01:00.000Z',
        completedAt: '2026-07-30T12:01:00.200Z',
      },
    })),
    close: vi.fn(async (): Promise<CloudCodeSession> => ({ ...session, state: 'closed' })),
    commit: vi.fn(async () => ({
      session,
      push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
    })),
    startAgentTurn: vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      stopReason: 'done' as const,
      stepsUsed: 2,
      finalMessage: 'Installed dependencies and ran the tests.',
    })),
    listApprovals: vi.fn(async () => []),
    decideApproval: vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      stopReason: 'done' as const,
      stepsUsed: 3,
      finalMessage: 'Tests pass.',
    })),
    ...overrides,
  };
}

async function openSession(user: ReturnType<typeof userEvent.setup>, title: string) {
  const rail = await screen.findByRole('navigation', { name: 'Recents' });
  await user.click(within(rail).getByRole('button', { name: title }));
}

async function openEnvironment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: /^Isolated|Trusted hosts|Full internet/ }),
  );
}

/** The tier radios and the harness picker live in the Edit environment dialog. */
async function openEnvironmentSettings(user: ReturnType<typeof userEvent.setup>) {
  await openEnvironment(user);
  await user.click(await screen.findByRole('menuitem', { name: 'Edit environment' }));
  return screen.findByRole('dialog');
}

describe('CloudCodePage', () => {
  beforeEach(() => {
    push.mockReset();
    greetingName = 'Ada';
    greetingResolved = true;
  });

  it('opens on the home column with the greeting and the composer, not a create form', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(
      await screen.findByRole('heading', { name: "What's up next, Ada?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Build in an isolated cloud workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Managed Code/i)).not.toBeInTheDocument();
  });

  it('renders inside the shared app shell and keeps the rail destinations as links', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByTestId('web-app-shell')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Artifacts' })).toHaveAttribute(
      'href',
      '/chat/library?surface=artifact',
    );
    expect(screen.getByRole('link', { name: 'Customize' })).toHaveAttribute(
      'href',
      '/settings/capabilities',
    );
  });

  it('reveals routines and the two local-code destinations behind More', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    const more = await screen.findByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Routines' })).not.toBeInTheDocument();

    await user.click(more);

    expect(screen.getByRole('link', { name: 'Routines' })).toHaveAttribute(
      'href',
      '/chat/schedules',
    );
    expect(screen.getByRole('link', { name: 'Work with local code' })).toHaveAttribute(
      'href',
      '/download',
    );
    expect(screen.getByRole('link', { name: 'Open in the editor extension' })).toHaveAttribute(
      'href',
      '/vscode-extension',
    );
  });

  it('says there are no sessions yet rather than showing an empty list', async () => {
    render(<CloudCodePage api={createApi()} />);

    const rail = await screen.findByRole('navigation', { name: 'Recents' });
    expect(within(rail).getByText('No sessions yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show closed sessions' })).not.toBeInTheDocument();
  });

  it('hides closed sessions until the filter asks for them', async () => {
    const user = userEvent.setup();
    const closed: CloudCodeSession = {
      ...session,
      id: 'closed-1',
      title: 'Old run',
      state: 'closed',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [closed], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Recents' });
    expect(within(rail).getByText('No open sessions.')).toBeInTheDocument();

    await user.click(within(rail).getByRole('button', { name: 'Show closed sessions' }));

    expect(within(rail).getByRole('button', { name: 'Old run' })).toBeInTheDocument();
  });

  it('creates a session from the composer and starts the task as the first turn', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const field = await screen.findByRole('textbox', { name: 'Describe a task or ask a question' });
    await user.type(field, 'Install dependencies and run the test suite');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryUrl: null,
          repositoryBranch: null,
          networkAccess: 'none',
          runtimeId: null,
        }),
      ),
    );
    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({
          goal: 'Install dependencies and run the test suite',
          model: getRoutingSlotModel('coding_balanced'),
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(vi.mocked(api.create)).toHaveBeenCalledBefore(vi.mocked(api.startAgentTurn));
  });

  it('sends on Enter and keeps Shift+Enter for a newline', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    const field = await screen.findByRole('textbox', { name: 'Describe a task or ask a question' });
    await user.type(field, 'first line{Shift>}{Enter}{/Shift}second line');
    expect(api.create).not.toHaveBeenCalled();

    await user.type(field, '{Enter}');
    await waitFor(() => expect(api.create).toHaveBeenCalled());
  });

  it('renders an agent reply as prose and the commands as one collapsible row', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: 'all green',
      stderr: '',
      exitCode: 0,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    const row = await screen.findByRole('button', { name: 'Ran a command' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('pnpm test')).not.toBeInTheDocument();

    await user.click(row);
    expect(screen.getByText('pnpm test')).toBeInTheDocument();
    expect(screen.getByText('all green')).toBeInTheDocument();
  });

  it('groups consecutive commands into one row', async () => {
    const user = userEvent.setup();
    const entries = ['pnpm install', 'pnpm test', 'pnpm lint'].map((command, index) => ({
      id: `entry-${index}`,
      sessionId: session.id,
      command,
      stdout: '',
      stderr: '',
      exitCode: 0,
      startedAt: `2026-07-30T12:0${index + 1}:00.000Z`,
      completedAt: `2026-07-30T12:0${index + 1}:01.000Z`,
    }));
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: entries })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByRole('button', { name: 'Ran 3 commands' })).toBeInTheDocument();
  });

  it('prints a failed command on one line without expanding the group', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByText('pnpm test exited 1')).toBeInTheDocument();
  });

  it('surfaces a pending approval inline and resumes the turn on approve', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      startAgentTurn: vi.fn(async () => ({
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'awaiting_approval' as const,
        stepsUsed: 1,
        finalMessage: '',
        pendingApproval: {
          stepIndex: 0,
          toolUseId: 'tool-1',
          command: 'pnpm install',
          reason: 'Installing dependencies writes to the workspace.',
        },
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    const field = await screen.findByRole('textbox', { name: 'Describe a task or ask a question' });
    await user.type(field, 'install deps');
    await user.click(screen.getByRole('button', { name: 'Start the task' }));

    expect(await screen.findByText('Approval required')).toBeInTheDocument();
    expect(
      screen.getByText('Installing dependencies writes to the workspace.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve and continue' }));

    await waitFor(() =>
      expect(api.decideApproval).toHaveBeenCalledWith(session.id, {
        turnId: '22222222-2222-4222-8222-222222222222',
        stepIndex: 0,
        decision: 'approve',
      }),
    );
    expect(await screen.findByText('Tests pass.')).toBeInTheDocument();
  });

  it('re-reads approvals persisted by an earlier tab when a session is opened', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      listApprovals: vi.fn(async () => [
        {
          turnId: '33333333-3333-4333-8333-333333333333',
          stepIndex: 2,
          command: 'rm -rf build',
          reason: 'Deleting files is destructive.',
          goal: 'clean the build',
          expiresAt: '2026-07-30T12:30:00.000Z',
          createdAt: '2026-07-30T12:00:00.000Z',
        },
      ]),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);

    expect(await screen.findByText('Deleting files is destructive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('shows the closed banner in the composer slot and no composer', async () => {
    const user = userEvent.setup();
    const closed: CloudCodeSession = { ...session, state: 'closed' };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [closed], runtimes: [] })),
      get: vi.fn(async () => ({ session: closed, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Recents' });
    await user.click(within(rail).getByRole('button', { name: 'Show closed sessions' }));
    await user.click(within(rail).getByRole('button', { name: closed.title }));

    expect(
      await screen.findByText('This session is closed. Start a new one to keep working.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New session' }));
    expect(
      await screen.findByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeInTheDocument();
  });

  it('asks what closing a session destroys before closing it', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Close session' }));

    expect(await screen.findByText(/Uncommitted work is lost/)).toBeInTheDocument();
    expect(api.close).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close session' }));
    await waitFor(() => expect(api.close).toHaveBeenCalledWith(session.id));
  });

  it('keeps the terminal and the run field behind the changes panel', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    expect(screen.queryByRole('textbox', { name: 'Command' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Terminal' }));

    const command = await screen.findByRole('textbox', { name: 'Command' });
    await user.type(command, 'pwd');
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.run).toHaveBeenCalledWith(session.id, 'pwd'));
    expect(await screen.findByText('/home/user')).toBeInTheDocument();
  });

  it('offers commit and push in the changes panel for a session with a repository', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [] })),
      commit: vi.fn(async () => ({
        session: repoSession,
        push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    expect(await screen.findByText('Isolated · owner/repository')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Changes' }));
    const message = await screen.findByRole('textbox', { name: 'Commit message' });
    await user.type(message, 'wire the settings toggle');
    await user.click(screen.getByRole('button', { name: 'Commit and push' }));

    await waitFor(() =>
      expect(api.commit).toHaveBeenCalledWith(repoSession.id, 'wire the settings toggle'),
    );
    expect(await screen.findByText('Pushed to the repository.')).toBeInTheDocument();
  });

  it('does not offer commit and push for a session with no repository', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(screen.queryByRole('textbox', { name: 'Commit message' })).not.toBeInTheDocument();
  });

  it('names the three network tiers on the environment chip and requires the full-internet acknowledgement', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const tiers = await screen.findByRole('radiogroup', { name: 'Network access' });
    expect(within(tiers).getByText('Isolated')).toBeInTheDocument();
    expect(within(tiers).getByText('Trusted hosts')).toBeInTheDocument();

    await user.click(within(tiers).getByText('Full internet'));
    expect(screen.getByRole('button', { name: 'Open an empty environment' })).toBeDisabled();
    expect(screen.queryByLabelText('Extra allowed hosts')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Open an empty environment' })).toBeEnabled();
  });

  it('sends parsed extra hosts and omits them under full internet', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const hosts = await screen.findByLabelText('Extra allowed hosts');
    await user.type(hosts, 'api.example.com, *.internal.example.com ,');
    await user.click(screen.getByRole('button', { name: 'Open an empty environment' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          networkAccess: 'none',
          extraHosts: ['api.example.com', '*.internal.example.com'],
        }),
      ),
    );
  });

  it('raises an isolated environment to trusted hosts when a repository is chosen', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<CloudCodePage api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await user.click(screen.getByRole('button', { name: 'Use this repository' }));

    expect(await screen.findByRole('button', { name: /owner\/repository/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trusted hosts/ })).toBeInTheDocument();

    const field = screen.getByRole('textbox', { name: 'Describe a task or ask a question' });
    await user.type(field, 'run the tests{Enter}');

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryUrl: 'https://github.com/owner/repository',
          networkAccess: 'trusted',
        }),
      ),
    );
  });

  it('offers the account’s sandbox images and sends the chosen one', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'tpl-base',
            name: 'base',
            kind: 'image' as const,
            summary: 'Plain Linux.',
            agentCommand: null,
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
          {
            id: 'tpl-codex',
            name: 'codex',
            kind: 'harness' as const,
            summary: 'A coding agent CLI.',
            agentCommand: 'codex',
            cpuCount: 4,
            memoryMB: 8192,
            diskSizeMB: 40960,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    const picker = await screen.findByLabelText('Coding harness');
    expect(picker).toBeEnabled();
    expect(
      screen.getByRole('option', { name: 'codex, A coding agent CLI. · 4 vCPU, 8 GB RAM' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Coding agents' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Environments' })).toBeInTheDocument();

    await user.selectOptions(picker, 'tpl-codex');
    await user.click(screen.getByRole('button', { name: 'Open an empty environment' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(vi.mocked(api.create).mock.calls[0]![0]).toMatchObject({ runtimeId: 'tpl-codex' });
  });

  it('explains an empty catalogue instead of offering a picker that does nothing', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await openEnvironmentSettings(user);
    expect(await screen.findByLabelText('Coding harness')).toBeDisabled();
    expect(
      screen.getByText(/Managed Code is not configured for this deployment/i),
    ).toBeInTheDocument();
  });

  it('shows the exact headless command and the harness budget for a runtime with a registered runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'codex',
            name: 'Codex',
            kind: 'harness' as const,
            summary: 'A coding agent CLI.',
            agentCommand: 'codex',
            cpuCount: 4,
            memoryMB: 8192,
            diskSizeMB: 40960,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    await user.selectOptions(await screen.findByLabelText('Coding harness'), 'codex');

    expect(
      screen.getByText(/codex exec --sandbox workspace-write --skip-git-repo-check --json/),
    ).toBeInTheDocument();
    expect(screen.getByText(/capped at 9 minutes/)).toBeInTheDocument();
  });

  it('falls back to the generic-loop copy when the runtime has no registered harness runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability,
        sessions: [],
        runtimes: [
          {
            id: 'openclaw',
            name: 'OpenClaw',
            kind: 'harness' as const,
            summary: 'Open-source agent harness.',
            agentCommand: 'openclaw',
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
        ],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openEnvironmentSettings(user);
    await user.selectOptions(await screen.findByLabelText('Coding harness'), 'openclaw');

    expect(screen.getByText(/generic tool-calling loop/)).toBeInTheDocument();
    expect(screen.queryByText(/capped at \d+ minutes/)).not.toBeInTheDocument();
  });

  it('is capability-honest when the deployment has no managed environment', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, deploymentEnabled: false },
        sessions: [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(
      await screen.findByText(/Managed environments are not enabled on this deployment/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe a task or ask a question' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start the task' })).toBeDisabled();
  });

  it('does not offer command execution for readable history when managed compute is unavailable', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, deploymentEnabled: false },
        sessions: [session],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Terminal' }));

    const command = await screen.findByRole('textbox', { name: 'Command' });
    expect(command).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(api.run).not.toHaveBeenCalled();
  });

  it('reports an unapplied storage migration without pretending a session can start', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: { ...availability, storageReady: false },
        sessions: [],
        runtimes: [],
      })),
    });
    render(<CloudCodePage api={api} />);

    expect(
      await screen.findByText(/Managed environments are not available yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the task' })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('offers Retry on a failed load and reloads on click', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce({ availability, sessions: [], runtimes: [] });
    render(<CloudCodePage api={createApi({ list })} />);

    expect(
      await screen.findByText('You are going a little fast. Wait a moment and try again.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText('You are going a little fast. Wait a moment and try again.'),
    ).not.toBeInTheDocument();
  });

  it('offers status, environment and sort filters and clears them', async () => {
    const user = userEvent.setup();
    const trusted: CloudCodeSession = {
      ...session,
      id: 'trusted-1',
      title: 'Trusted run',
      networkAccess: 'trusted',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, trusted], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Recents' });
    expect(within(rail).getAllByRole('button')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Trusted hosts' }));

    expect(within(rail).getAllByRole('button')).toHaveLength(1);
    expect(within(rail).getByRole('button', { name: 'Trusted run' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Clear filters' }));

    expect(within(rail).getAllByRole('button')).toHaveLength(2);
  });

  it('sorts the session list by title when asked', async () => {
    const user = userEvent.setup();
    const older: CloudCodeSession = {
      ...session,
      id: 'a-1',
      title: 'Alpha task',
      updatedAt: '2026-07-29T12:00:00.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session, older], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    const rail = await screen.findByRole('navigation', { name: 'Recents' });
    expect(within(rail).getAllByRole('button')[0]).toHaveTextContent(session.title);

    await user.click(screen.getByRole('button', { name: 'Filter sessions' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Title' }));

    expect(within(rail).getAllByRole('button')[0]).toHaveTextContent('Alpha task');
  });

  it('marks a running session with a dot instead of the archive glyph', async () => {
    const running: CloudCodeSession = { ...session, state: 'running' };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [running], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    expect(await screen.findByLabelText('Running')).toBeInTheDocument();
  });

  it('collapses the session column and offers a way back', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Collapse the session list' }));

    expect(screen.queryByRole('navigation', { name: 'Recents' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand the session list' }));

    expect(await screen.findByRole('navigation', { name: 'Recents' })).toBeInTheDocument();
  });

  it('names the environment and the repository in one header chip', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      networkAccess: 'trusted',
      repositoryUrl: 'https://github.com/owner/repository',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);

    expect(await screen.findByText('Trusted hosts · owner/repository')).toBeInTheDocument();
  });

  it('lists what provisioning did behind the initialized session row', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      runtimeId: 'tpl-codex',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Initialized session' }));

    expect(screen.getByText('Set up a cloud container')).toBeInTheDocument();
    expect(screen.getByText('Cloned the repository')).toBeInTheDocument();
    expect(screen.getByText('Started the coding agent')).toBeInTheDocument();
  });

  it('says which provisioning steps were skipped for a bare session', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Initialized session' }));

    expect(screen.getByText('No repository was attached')).toBeInTheDocument();
    expect(screen.getByText('No coding agent was installed')).toBeInTheDocument();
  });

  it('reports a failed session in the initialized row instead of a clean checklist', async () => {
    const user = userEvent.setup();
    const failed: CloudCodeSession = {
      ...session,
      state: 'failed',
      lastError: 'The sandbox could not be attached',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [failed], runtimes: [] })),
      get: vi.fn(async () => ({ session: failed, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, `${failed.title} Needs attention`);
    await user.click(await screen.findByRole('button', { name: 'Provisioning did not finish' }));

    expect(screen.getByText('The sandbox could not be attached')).toBeInTheDocument();
  });

  it('expands a command group into one card per command', async () => {
    const user = userEvent.setup();
    const entries = ['pnpm install', 'pnpm test'].map((command, index) => ({
      id: `entry-${index}`,
      sessionId: session.id,
      command,
      stdout: `output for ${command}`,
      stderr: '',
      exitCode: 0,
      startedAt: `2026-07-30T12:0${index + 1}:00.000Z`,
      completedAt: `2026-07-30T12:0${index + 1}:01.000Z`,
    }));
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: entries })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Ran 2 commands' }));

    expect(screen.getByRole('button', { name: 'pnpm install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pnpm test' })).toBeInTheDocument();
    expect(screen.getByText('output for pnpm install')).toBeInTheDocument();
  });

  it('expands every command row when the transcript view is verbose', async () => {
    const user = userEvent.setup();
    const entry = {
      id: 'entry-1',
      sessionId: session.id,
      command: 'pnpm test',
      stdout: 'all green',
      stderr: '',
      exitCode: 0,
      startedAt: '2026-07-30T12:01:00.000Z',
      completedAt: '2026-07-30T12:01:02.000Z',
    };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
      get: vi.fn(async () => ({ session, terminalEntries: [entry] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    expect(screen.queryByText('all green')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Session actions' }));
    // Radix opens a submenu on hover or ArrowRight; a click on the trigger closes
    // the whole menu, so the keyboard path is the one a test can drive.
    (await screen.findByRole('menuitem', { name: 'Transcript view' })).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitemradio', { name: 'Verbose' }));

    expect(await screen.findByText('all green')).toBeInTheDocument();
  });

  it('reads the changed files from git status rather than inventing a diff', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = {
      ...session,
      repositoryUrl: 'https://github.com/owner/repository',
      repositoryBranch: 'main',
    };
    const run: CloudCodeApi['run'] = vi.fn(async () => ({
      session: repoSession,
      terminalEntry: {
        id: 'status-1',
        sessionId: repoSession.id,
        command: 'git status --porcelain',
        stdout: ' M apps/web/page.tsx\n?? notes.md\n',
        stderr: '',
        exitCode: 0,
        startedAt: '2026-07-30T12:05:00.000Z',
        completedAt: '2026-07-30T12:05:00.400Z',
      },
    }));
    const api = createApi({
      run,
      list: vi.fn(async () => ({ availability, sessions: [repoSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, repoSession.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Check for changes' }));

    await waitFor(() => expect(run).toHaveBeenCalledWith(repoSession.id, 'git status --porcelain'));
    expect(await screen.findByText('apps/web/page.tsx')).toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
  });

  it('says there is nothing to push for a session with no repository', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await user.click(await screen.findByRole('button', { name: 'Changes' }));

    expect(
      await screen.findByText('This session has no repository, so there is nothing to push.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check for changes' })).not.toBeInTheDocument();
  });

  it('names the approval modes the capabilities settings define, with shortcuts', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Approval mode' }));

    expect(await screen.findByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Ask before every action')).toBeInTheDocument();
    expect(screen.getByText('Run read-only actions without asking')).toBeInTheDocument();
  });

  it('shows the repository and its branch as two chips plus an add control', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Select repository' }));
    await user.type(
      await screen.findByLabelText('Repository URL'),
      'https://github.com/owner/repository',
    );
    await user.type(await screen.findByLabelText('Branch'), 'release');
    await user.click(screen.getByRole('button', { name: 'Use this repository' }));

    expect(await screen.findByRole('button', { name: 'owner/repository' })).toBeInTheDocument();
    expect(screen.getByText('release')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a repository' })).toBeInTheDocument();
  });

  it('asks the shell for no rail and leaves the reader collapse choice alone', async () => {
    const { setSidebarCollapsed } = useUIStore.getState();
    setSidebarCollapsed(false);

    const view = render(<CloudCodePage api={createApi()} />);
    await screen.findByRole('heading', { name: /What's up next/ });

    expect(screen.getByTestId('web-app-shell').dataset['rail']).toBe('false');
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    view.unmount();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('keeps the approval rows to one line of guidance each', async () => {
    const user = userEvent.setup();
    render(<CloudCodePage api={createApi()} />);

    await user.click(await screen.findByRole('button', { name: 'Approval mode' }));

    const rows = await screen.findAllByRole('menuitemradio');
    expect(rows).toHaveLength(TOOL_APPROVAL_POLICY_OPTIONS.length);
    for (const option of TOOL_APPROVAL_POLICY_OPTIONS) {
      expect(screen.getByText(option.hint)).toBeInTheDocument();
      expect(screen.queryByText(option.description)).not.toBeInTheDocument();
    }
    expect(rows[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('holds the greeting until the account name resolves', async () => {
    greetingName = undefined;
    greetingResolved = false;
    render(<CloudCodePage api={createApi()} />);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).not.toHaveTextContent("What's up next?");
  });

  it('shows the notebook panel for a code-interpreter session', async () => {
    const user = userEvent.setup();
    const notebookSession: CloudCodeSession = { ...session, runtimeId: NOTEBOOK_TEMPLATE_ID };
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [notebookSession], runtimes: [] })),
      get: vi.fn(async () => ({ session: notebookSession, terminalEntries: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, notebookSession.title);

    expect(await screen.findByTestId('notebook-panel')).toHaveTextContent(notebookSession.id);
  });

  it('does not show the notebook panel for a harness session', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({ availability, sessions: [session], runtimes: [] })),
    });
    render(<CloudCodePage api={api} />);

    await openSession(user, session.title);
    await screen.findByRole('button', { name: 'Changes' });

    expect(screen.queryByTestId('notebook-panel')).not.toBeInTheDocument();
  });
});
