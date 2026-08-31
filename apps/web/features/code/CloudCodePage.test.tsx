import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoutingSlotModel, type CloudCodeSession } from '@agiworkforce/types';
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
  networkAccess: 'none',
  runtimeId: null,
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
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
          {
            id: 'tpl-codex',
            name: 'codex',
            cpuCount: 4,
            memoryMB: 8192,
            diskSizeMB: 40960,
            isPublic: true,
          },
        ],
      })),
    });

    render(<CloudCodePage api={api} />);

    const picker = await screen.findByLabelText('Sandbox image');
    expect(picker).toBeEnabled();
    // the resources are part of the label, so the choice is informed
    expect(
      screen.getByRole('option', { name: 'codex \u2014 4 vCPU, 8 GB RAM' }),
    ).toBeInTheDocument();

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
            cpuCount: 2,
            memoryMB: 4096,
            diskSizeMB: 20480,
            isPublic: true,
          },
        ],
      })),
    });

    render(<CloudCodePage api={api} />);
    await screen.findByLabelText('Sandbox image');
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

    const picker = await screen.findByLabelText('Sandbox image');
    expect(picker).toBeDisabled();
    expect(
      screen.getByText(/No images are published to this account.s E2B team/i),
    ).toBeInTheDocument();
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
});
