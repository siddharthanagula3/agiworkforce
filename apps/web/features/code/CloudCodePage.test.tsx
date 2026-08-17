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
