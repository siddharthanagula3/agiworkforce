import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import UpgradeAccessPanel from './UpgradeAccessPanel';

type CsrfModule = typeof import('@/lib/client/csrf');

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: async (headers: Record<string, string>) => ({ ...headers, 'x-csrf-token': 't' }),
}));

const STATE_PATH = '/api/admin/upgrade-access';
const CODES_PATH = '/api/admin/upgrade-access/codes';

const CLOSED = {
  open: false,
  switchOpen: false,
  forcedOpenByEnvironment: false,
  targetingRules: 0,
  lastChange: null,
};

const OPEN = {
  ...CLOSED,
  open: true,
  switchOpen: true,
  lastChange: { opened: true, changedAt: '2026-10-12T03:00:00.000Z', changedBy: 'user_operator_1' },
};

const FOUNDERS = {
  id: '00000000-0000-4000-8000-000000000101',
  code: 'FOUNDERS2026',
  maxRedemptions: 25,
  redemptions: 7,
  expiresAt: null,
  active: true,
  note: 'First design partners',
  createdAt: '2026-10-12T04:00:00.000Z',
  createdBy: 'user_operator_1',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

interface Backend {
  state: unknown;
  codes: unknown[];
  onWrite?: (path: string, method: string, body: unknown) => Response | undefined;
}

function serve(backend: Backend) {
  mocks.fetch.mockImplementation(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') {
      const body: unknown = JSON.parse(String(init.body));
      const answered = backend.onWrite?.(path, method, body);
      if (answered) return answered;
    }
    return path === STATE_PATH
      ? jsonResponse(backend.state)
      : jsonResponse({ codes: backend.codes, truncated: false });
  });
}

function writes() {
  return mocks.fetch.mock.calls
    .filter((call: unknown[]) => (call[1] as RequestInit | undefined)?.method)
    .map((call: unknown[]) => ({
      path: call[0],
      method: (call[1] as RequestInit).method,
      body: JSON.parse(String((call[1] as RequestInit).body)),
    }));
}

const UNDER_BODY_SIZE = /(^|\s)text-(xs|\[1[0-3]px\])(\s|$)/;

describe('UpgradeAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading before the requests settle', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<UpgradeAccessPanel />);

    expect(screen.getByText('Reading paid upgrade access…')).toBeInTheDocument();
    expect(screen.getByText('Reading the access codes…')).toBeInTheDocument();
  });

  it('shows the closed state and offers only to open', async () => {
    serve({ state: CLOSED, codes: [] });
    render(<UpgradeAccessPanel />);

    expect(await screen.findByTestId('upgrade-access-state')).toHaveTextContent(
      'Behind the waitlist',
    );
    expect(screen.getByText('Nobody has changed this switch yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open paid upgrades to everyone' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close paid upgrades' })).toBeNull();
  });

  it('does not open upgrades until the consequence is confirmed', async () => {
    serve({
      state: CLOSED,
      codes: [],
      onWrite: (path) => (path === STATE_PATH ? jsonResponse(OPEN) : undefined),
    });
    render(<UpgradeAccessPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open paid upgrades to everyone' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Open paid upgrades to everyone?');
    expect(dialog).toHaveTextContent(
      'Every signed-in person can start checkout and store purchases immediately',
    );
    expect(writes()).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Open paid upgrades' }));

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-access-state')).toHaveTextContent('Open to everyone'),
    );
    expect(writes()).toEqual([{ path: STATE_PATH, method: 'POST', body: { open: true } }]);
    expect(screen.getByText(/Last opened on .* by user_operator_1\./)).toBeInTheDocument();
  });

  it('leaves upgrades closed when the confirmation is cancelled', async () => {
    serve({ state: CLOSED, codes: [] });
    render(<UpgradeAccessPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open paid upgrades to everyone' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(writes()).toEqual([]);
    expect(screen.getByTestId('upgrade-access-state')).toHaveTextContent('Behind the waitlist');
  });

  it('names what closing does to new upgrades and to existing subscribers', async () => {
    serve({
      state: OPEN,
      codes: [],
      onWrite: (path) => (path === STATE_PATH ? jsonResponse(CLOSED) : undefined),
    });
    render(<UpgradeAccessPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Close paid upgrades' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('New upgrades need an access code again');
    expect(dialog).toHaveTextContent('Existing subscribers are unaffected');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close paid upgrades' }));

    await waitFor(() =>
      expect(screen.getByTestId('upgrade-access-state')).toHaveTextContent('Behind the waitlist'),
    );
    expect(writes()).toEqual([{ path: STATE_PATH, method: 'POST', body: { open: false } }]);
  });

  it('keeps the shown state and raises an alert when the change is refused', async () => {
    serve({
      state: CLOSED,
      codes: [],
      onWrite: () => jsonResponse({ error: { message: 'The switch changed. Try again.' } }, 409),
    });
    render(<UpgradeAccessPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open paid upgrades to everyone' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Open paid upgrades',
      }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-access-state')).toHaveTextContent('Behind the waitlist');
  });

  it('warns that the environment holds upgrades open over a closed switch', async () => {
    serve({ state: { ...CLOSED, open: true, forcedOpenByEnvironment: true }, codes: [] });
    render(<UpgradeAccessPanel />);

    expect(await screen.findByTestId('upgrade-access-state')).toHaveTextContent('Open to everyone');
    expect(screen.getByText('AGI_BILLING_WAITLIST_OPEN=1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open paid upgrades to everyone' }),
    ).toBeInTheDocument();
  });

  it('creates a code from the form and shows it once the list reloads', async () => {
    const backend: Backend = { state: CLOSED, codes: [] };
    backend.onWrite = (path, method) => {
      if (path !== CODES_PATH || method !== 'POST') return undefined;
      backend.codes = [FOUNDERS];
      return jsonResponse({ code: FOUNDERS }, 201);
    };
    serve(backend);
    render(<UpgradeAccessPanel />);
    await screen.findByText(/No access code exists yet/);

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'founders2026' } });
    fireEvent.change(screen.getByLabelText('Maximum redemptions'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'First design partners' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create access code' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Created FOUNDERS2026');
    expect(writes()).toEqual([
      {
        path: CODES_PATH,
        method: 'POST',
        body: { code: 'founders2026', maxRedemptions: 25, note: 'First design partners' },
      },
    ]);
    const row = (await screen.findByRole('button', { name: 'Disable FOUNDERS2026' })).closest(
      'tr',
    )!;
    expect(row).toHaveTextContent('7 of 25');
    expect(row).toHaveTextContent('Active');
  });

  it('asks the server to generate the code when the field is left empty', async () => {
    serve({
      state: CLOSED,
      codes: [],
      onWrite: (path) => (path === CODES_PATH ? jsonResponse({ code: FOUNDERS }, 201) : undefined),
    });
    render(<UpgradeAccessPanel />);
    await screen.findByText(/No access code exists yet/);

    fireEvent.click(screen.getByRole('button', { name: 'Create access code' }));

    await screen.findByRole('status');
    expect(writes()).toEqual([{ path: CODES_PATH, method: 'POST', body: { maxRedemptions: 1 } }]);
  });

  it('shows the refusal when a code cannot be created', async () => {
    serve({
      state: CLOSED,
      codes: [],
      onWrite: () =>
        jsonResponse({ error: { message: 'That code already exists. Choose another.' } }, 409),
    });
    render(<UpgradeAccessPanel />);
    await screen.findByText(/No access code exists yet/);

    fireEvent.click(screen.getByRole('button', { name: 'Create access code' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disables a code only after confirming who keeps access', async () => {
    const backend: Backend = { state: CLOSED, codes: [FOUNDERS] };
    backend.onWrite = (path, method) => {
      if (path !== CODES_PATH || method !== 'DELETE') return undefined;
      backend.codes = [{ ...FOUNDERS, active: false }];
      return jsonResponse({ code: { ...FOUNDERS, active: false } });
    };
    serve(backend);
    render(<UpgradeAccessPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disable FOUNDERS2026' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Disable FOUNDERS2026?');
    expect(dialog).toHaveTextContent(
      'The 7 account(s) that already redeemed it keep their upgrade access',
    );
    expect(dialog).toHaveTextContent('cannot be switched back on here');
    expect(writes()).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable code' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Disable FOUNDERS2026' })).toBeNull(),
    );
    expect(writes()).toEqual([{ path: CODES_PATH, method: 'DELETE', body: { id: FOUNDERS.id } }]);
    expect(screen.getByText('FOUNDERS2026').closest('tr')).toHaveTextContent('Disabled');
  });

  it('labels a code that ran out or expired instead of calling it active', async () => {
    serve({
      state: CLOSED,
      codes: [
        { ...FOUNDERS, id: 'a', code: 'USEDUP', redemptions: 25 },
        { ...FOUNDERS, id: 'b', code: 'TOOLATE', expiresAt: '2020-01-01T00:00:00.000Z' },
      ],
    });
    render(<UpgradeAccessPanel />);

    expect((await screen.findByText('USEDUP')).closest('tr')).toHaveTextContent('Fully redeemed');
    expect(screen.getByText('TOOLATE').closest('tr')).toHaveTextContent('Expired');
  });

  it('sets no line under the 14px body size', async () => {
    serve({ state: OPEN, codes: [FOUNDERS] });
    const { container } = render(<UpgradeAccessPanel />);
    await screen.findByText('FOUNDERS2026');

    const small = Array.from(container.querySelectorAll('[class]'))
      .map((element) => element.getAttribute('class') ?? '')
      .filter((classes) => UNDER_BODY_SIZE.test(classes));
    expect(small).toEqual([]);
  });
});
