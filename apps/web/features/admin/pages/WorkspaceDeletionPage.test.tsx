import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));

import WorkspaceDeletionPage from './WorkspaceDeletionPage';

const WORKSPACE = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Northwind Research',
  slug: 'northwind',
  memberCount: 12,
  currentUserRole: 'owner',
};

const NO_PENDING_DELETION = {
  pending: false,
  requestedAt: null,
  scheduledFor: null,
  canCancel: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

function serveWorkspace(
  overrides: { organization?: unknown; deletion?: unknown } = {},
  writeResponse: Response = jsonResponse({ message: 'Workspace deletion scheduled.' }),
) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return writeResponse;
    return jsonResponse({
      organization: overrides.organization ?? WORKSPACE,
      deletion: overrides.deletion ?? NO_PENDING_DELETION,
    });
  });
}

function writeCalls(): Array<[string, RequestInit]> {
  return fetchMock.mock.calls.filter(
    (call): call is [string, RequestInit] => Boolean(call[1]?.method) && call[1].method !== 'GET',
  );
}

function typeConfirmation(value: string) {
  fireEvent.change(screen.getByLabelText(/to continue/), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('scheduling a workspace deletion', () => {
  it('will not fire the request until the workspace name has been typed', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    const submit = screen.getByRole('button', { name: 'Schedule deletion' });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);

    expect(writeCalls()).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('keeps refusing while what was typed is close but not the name', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    typeConfirmation('Northwind');

    expect(screen.getByRole('button', { name: 'Schedule deletion' })).toBeDisabled();
  });

  it('accepts the slug, which is what the server accepts too', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    typeConfirmation(WORKSPACE.slug);

    expect(screen.getByRole('button', { name: 'Schedule deletion' })).toBeEnabled();
  });

  it('asks a second time, naming what stops working and who loses access', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });
    typeConfirmation(WORKSPACE.name);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }));

    expect(screen.getByText(/Every chat, project, file, connector and API key/)).toBeVisible();
    expect(
      screen.getByText(/The audit trail is kept without its link to the workspace/),
    ).toBeVisible();
    expect(screen.getByText(/All 12 members lose it/)).toBeVisible();
    expect(screen.getByText(/cancel from this page until the scheduled date/)).toBeVisible();
    expect(writeCalls()).toHaveLength(0);
  });

  it('sends nothing when that second question is declined', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });
    typeConfirmation(WORKSPACE.name);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(writeCalls()).toHaveLength(0);
  });

  it('schedules with the typed confirmation once both steps are done', async () => {
    serveWorkspace();
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });
    typeConfirmation(WORKSPACE.name);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Schedule deletion' }).at(-1) as Element);

    await waitFor(() => expect(writeCalls()).toHaveLength(1));
    const [url, init] = writeCalls()[0] as [string, RequestInit];
    expect(url).toBe('/api/settings/organization');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ confirm: WORKSPACE.name });
  });

  it('reports the server refusal instead of claiming the workspace is gone', async () => {
    serveWorkspace({}, jsonResponse({ error: { message: 'Release every hold first.' } }, 409));
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });
    typeConfirmation(WORKSPACE.name);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule deletion' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Schedule deletion' }).at(-1) as Element);

    expect(await screen.findByRole('alert')).toHaveTextContent('Release every hold first.');
  });

  it('offers a member nothing to press', async () => {
    serveWorkspace({ organization: { ...WORKSPACE, currentUserRole: 'admin' } });
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    typeConfirmation(WORKSPACE.name);

    expect(screen.getByRole('button', { name: 'Schedule deletion' })).toBeDisabled();
    expect(screen.getByText(/Only the workspace owner can delete it/)).toBeVisible();
  });
});

describe('the window between the request and the erasure', () => {
  const SCHEDULED_FOR = '2099-01-01T00:00:00.000Z';

  it('shows the date and the way back out', async () => {
    serveWorkspace(
      {
        deletion: {
          pending: true,
          requestedAt: '2026-09-17T00:00:00.000Z',
          scheduledFor: SCHEDULED_FOR,
          canCancel: true,
        },
      },
      jsonResponse({ message: 'Workspace deletion cancelled. The workspace is fully restored.' }),
    );
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    expect(screen.getByText(/Deletion is scheduled for/)).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel deletion and keep this workspace' }),
    );

    await waitFor(() => expect(writeCalls()).toHaveLength(1));
    const [url, init] = writeCalls()[0] as [string, RequestInit];
    expect(url).toBe('/api/settings/organization/deletion/cancel');
    expect(init.method).toBe('POST');
  });

  it('stops offering the way out once the window has closed', async () => {
    serveWorkspace({
      deletion: {
        pending: true,
        requestedAt: '2026-09-01T00:00:00.000Z',
        scheduledFor: '2026-09-02T00:00:00.000Z',
        canCancel: false,
      },
    });
    render(<WorkspaceDeletionPage />);
    await screen.findByRole('heading', { name: WORKSPACE.name });

    expect(screen.queryByRole('button', { name: /Cancel deletion/ })).toBeNull();
    expect(screen.getByText(/erasure is underway/)).toBeVisible();
  });
});
