import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCodeSession } from '@agiworkforce/types';
import { CloudCodePage } from './CloudCodePage';
import type { CloudCodeApi } from './services/cloud-code-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
    ...overrides,
  };
}

describe('CloudCodePage', () => {
  beforeEach(() => {
    push.mockReset();
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

    expect(await screen.findByText('Managed Code storage is not ready.')).toBeInTheDocument();
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
});
