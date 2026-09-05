import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoutingSlotModel,
  NOTEBOOK_TEMPLATE_ID,
  type CloudCodeSession,
} from '@agiworkforce/types';
import { CloudCodePage } from './CloudCodePage';
import type { CloudCodeApi } from './services/cloud-code-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/chat/code',
}));

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="web-app-shell">{children}</div>
  ),
}));

vi.mock('@/features/notebook/NotebookPanel', () => ({
  NotebookPanel: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="notebook-panel">{sessionId}</div>
  ),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        id: 'user-1',
        email: 'person@example.com',
        name: 'Test Person',
        profile: { display_name: 'Test Person' },
      },
      subscription: { display_name: 'Pro' },
    }),
}));

const session: CloudCodeSession = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'New workspace',
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

function createApi(overrides: Partial<CloudCodeApi> = {}): CloudCodeApi {
  return {
    list: vi.fn(async () => ({
      availability: {
        deploymentEnabled: true,
        storageReady: true,
        planEntitled: true,
        planTier: 'pro',
        maxSessions: 5,
      },
      sessions: [],
      runtimes: [],
    })),
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

describe('CloudCodePage', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('offers the account\u2019s sandbox images and sends the chosen one', async () => {
    const user = userEvent.setup();
    const create: CloudCodeApi['create'] = vi.fn(async () => ({ session, terminalEntries: [] }));
    const api = createApi({
      create,
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
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
            summary: 'OpenAI’s coding agent CLI.',
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

    const picker = await screen.findByLabelText('Coding harness');
    expect(picker).toBeEnabled();
    // what the agent is and what it runs on are both in the label, so the
    // choice is informed rather than a bare template name
    expect(
      screen.getByRole('option', {
        name: 'codex, OpenAI\u2019s coding agent CLI. \u00b7 4 vCPU, 8 GB RAM',
      }),
    ).toBeInTheDocument();
    // agents and plain environments are told apart
    expect(screen.getByRole('group', { name: 'Coding agents' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Environments' })).toBeInTheDocument();

    await user.selectOptions(picker, 'tpl-codex');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(vi.mocked(create).mock.calls[0]![0]).toMatchObject({ runtimeId: 'tpl-codex' });
  });

  it('sends no image when the default is left selected', async () => {
    const user = userEvent.setup();
    const create: CloudCodeApi['create'] = vi.fn(async () => ({ session, terminalEntries: [] }));
    const api = createApi({
      create,
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
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
        ],
      })),
    });

    render(<CloudCodePage api={api} />);
    await screen.findByLabelText('Coding harness');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(vi.mocked(create).mock.calls[0]![0]).toMatchObject({ runtimeId: null });
  });

  it('starts the described task in the same gesture as creating the workspace', async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => ({ session, terminalEntries: [] }));
    const startAgentTurn: CloudCodeApi['startAgentTurn'] = vi.fn(async () => ({
      turnId: '22222222-2222-4222-8222-222222222222',
      stopReason: 'done' as const,
      stepsUsed: 2,
      finalMessage: 'Ran the tests.',
    }));
    const api = createApi({ create, startAgentTurn });

    render(<CloudCodePage api={api} />);

    const task = await screen.findByLabelText('Task');
    await user.type(task, 'Install dependencies and run the test suite');
    // the control names what it will do, not just what it provisions
    await user.click(await screen.findByRole('button', { name: 'Start task' }));

    await waitFor(() => expect(startAgentTurn).toHaveBeenCalled());
    expect(vi.mocked(startAgentTurn).mock.calls[0]![1]).toMatchObject({
      goal: 'Install dependencies and run the test suite',
    });
    expect(vi.mocked(create)).toHaveBeenCalledBefore(vi.mocked(startAgentTurn));
  });

  it('opens an empty workspace when no task is described', async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => ({ session, terminalEntries: [] }));
    const startAgentTurn = vi.fn();
    const api = createApi({ create, startAgentTurn });

    render(<CloudCodePage api={api} />);
    await screen.findByLabelText('Task');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(startAgentTurn).not.toHaveBeenCalled();
  });

  it('explains an empty catalogue instead of offering a picker that does nothing', async () => {
    render(<CloudCodePage api={createApi()} />);

    const picker = await screen.findByLabelText('Coding harness');
    expect(picker).toBeDisabled();
    expect(
      screen.getByText(/Managed Code is not configured for this deployment/i),
    ).toBeInTheDocument();
  });

  it('offers Retry on a failed load and reloads on click', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [],
        runtimes: [],
      });
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

  it('shows the exact headless command and the harness budget for a runtime with a registered runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [],
        runtimes: [
          {
            id: 'codex',
            name: 'Codex',
            kind: 'harness' as const,
            summary: 'OpenAI’s coding agent CLI.',
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

    const picker = await screen.findByLabelText('Coding harness');
    await user.selectOptions(picker, 'codex');

    expect(
      screen.getByText(/codex exec --sandbox workspace-write --skip-git-repo-check --json/),
    ).toBeInTheDocument();
    expect(screen.getByText(/capped at 9 minutes/)).toBeInTheDocument();
  });

  it('falls back to the generic-loop copy when the runtime has no registered harness runner', async () => {
    const user = userEvent.setup();
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
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

    const picker = await screen.findByLabelText('Coding harness');
    await user.selectOptions(picker, 'openclaw');

    expect(screen.getByText(/generic tool-calling loop/)).toBeInTheDocument();
    expect(screen.queryByText(/capped at \d+ minutes/)).not.toBeInTheDocument();
  });

  it('surfaces commit and push for a session with a repository, and reports the result', async () => {
    const user = userEvent.setup();
    const repoSession: CloudCodeSession = { ...session, repositoryUrl: 'https://github.com/o/r' };
    const commit: CloudCodeApi['commit'] = vi.fn(async () => ({
      session: repoSession,
      push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
    }));
    const api = createApi({
      commit,
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [repoSession],
        runtimes: [],
      })),
      get: vi.fn(async () => ({ session: repoSession, terminalEntries: [] })),
    });

    render(<CloudCodePage api={api} />);

    const commitInput = await screen.findByLabelText('Commit message');
    await user.type(commitInput, 'wire the settings toggle');
    await user.click(screen.getByRole('button', { name: 'Commit and push' }));

    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(repoSession.id, 'wire the settings toggle'),
    );
    expect(await screen.findByText('Pushed to the repository.')).toBeInTheDocument();
  });

  it('shows the extra hosts a session was created with', async () => {
    const withHosts = { ...session, extraHosts: ['api.example.com', '*.internal.example.com'] };
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [withHosts],
        runtimes: [],
      })),
      get: vi.fn(async () => ({ session: withHosts, terminalEntries: [] })),
    });

    render(<CloudCodePage api={api} />);

    await screen.findByRole('textbox', { name: 'Terminal command' });
    expect(screen.getByText('+ api.example.com, *.internal.example.com')).toBeInTheDocument();
  });

  it('does not show an extra hosts badge for a session created without any', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    await screen.findByRole('textbox', { name: 'Terminal command' });
    expect(screen.queryByText(/^\+ /)).not.toBeInTheDocument();
  });

  it('does not offer commit and push for a session with no repository', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    await screen.findByRole('textbox', { name: 'Terminal command' });
    expect(screen.queryByLabelText('Commit message')).not.toBeInTheDocument();
  });

  it('renders inside the shared app shell instead of a private Code-only nav rail', async () => {
    render(<CloudCodePage api={createApi()} />);

    expect(await screen.findByTestId('web-app-shell')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desktop app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'VS Code extension' })).not.toBeInTheDocument();
  });

  it('is capability-honest when the deployment has no managed environment', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: false,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    expect(
      await screen.findByText('Managed Code is not enabled on this deployment.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New session' })).toBeDisabled();
    expect(
      screen.getByText(/without exposing your local files or credentials/i),
    ).toBeInTheDocument();
  });

  it('does not offer command execution for readable history when managed compute is unavailable', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: false,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
    });
    const user = userEvent.setup();

    render(<CloudCodePage api={api} />);

    const commandInput = await screen.findByRole('textbox', { name: 'Terminal command' });
    expect(commandInput).toBeDisabled();
    await user.type(commandInput, 'pwd');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(api.run).not.toHaveBeenCalled();
  });

  it('reports an unapplied storage migration without pretending a session can start', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: false,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    expect(await screen.findByText('Managed Code is coming soon.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New session' })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('creates a default network-isolated session and reveals the terminal', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    const createButton = await screen.findByRole('button', { name: 'Create session' });
    await user.click(createButton);

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New workspace',
          repositoryUrl: null,
          repositoryBranch: null,
          networkAccess: 'none',
          runtimeId: null,
        }),
      ),
    );
    expect(await screen.findByText(/commands run remotely/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Terminal command' })).toBeEnabled();
  });

  it('requires explicit acknowledgement before unrestricted network creation', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    await screen.findByRole('button', { name: 'Create session' });
    await user.click(screen.getByText('Full network'));

    expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
  });

  it('sends parsed extra hosts alongside the network preset', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    await screen.findByRole('button', { name: 'Create session' });
    const hostsField = screen.getByLabelText(/Extra allowed hosts/i);
    await user.type(hostsField, 'api.example.com, *.internal.example.com ,');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          networkAccess: 'none',
          extraHosts: ['api.example.com', '*.internal.example.com'],
        }),
      ),
    );
  });

  it('hides and omits extra hosts under full network', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    await screen.findByRole('button', { name: 'Create session' });
    await user.click(screen.getByText('Full network'));
    expect(screen.queryByLabelText(/Extra allowed hosts/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ networkAccess: 'full', extraHosts: undefined }),
      ),
    );
  });

  it('starts an agent turn against the session agent endpoint', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
    });
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    const goalInput = await screen.findByLabelText(/Describe a task/i);
    await user.type(goalInput, 'run the tests');
    await user.click(screen.getByRole('button', { name: /Start agent turn/i }));

    await waitFor(() =>
      expect(api.startAgentTurn).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({
          goal: 'run the tests',
          model: getRoutingSlotModel('coding_balanced'),
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(
      await screen.findByText('Installed dependencies and ran the tests.'),
    ).toBeInTheDocument();
  });

  it('surfaces a pending approval and resumes the turn on approve', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
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
    const user = userEvent.setup();
    render(<CloudCodePage api={api} />);

    const goalInput = await screen.findByLabelText(/Describe a task/i);
    await user.type(goalInput, 'install deps');
    await user.click(screen.getByRole('button', { name: /Start agent turn/i }));

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
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
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

    expect(await screen.findByText('Deleting files is destructive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('shows the notebook panel for a code-interpreter session', async () => {
    const notebookSession: CloudCodeSession = { ...session, runtimeId: NOTEBOOK_TEMPLATE_ID };
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [notebookSession],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    expect(await screen.findByTestId('notebook-panel')).toHaveTextContent(notebookSession.id);
  });

  it('does not show the notebook panel for a harness session', async () => {
    const api = createApi({
      list: vi.fn(async () => ({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
        runtimes: [],
      })),
    });

    render(<CloudCodePage api={api} />);

    await screen.findByRole('textbox', { name: 'Terminal command' });
    expect(screen.queryByTestId('notebook-panel')).not.toBeInTheDocument();
  });
});
