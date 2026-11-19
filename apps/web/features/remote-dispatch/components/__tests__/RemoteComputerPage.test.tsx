import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStatusLabel } from '@agiworkforce/types';
import { onAppCommand, PLANS_PAGE_PATH } from '@shared/lib/app-commands';
import { RemoteComputerPage, RemoteComputerScreen } from '../RemoteComputerPage';
import type { RemoteTaskStatus } from '../../lib/remote-dispatch-client';
import type { DictationLimit } from '@features/chat/hooks/use-dictation';

interface Handlers {
  onReady: (name: string | null) => void;
  onAway: () => void;
  onTaskStatus: (status: RemoteTaskStatus) => void;
  onClosed: (message: string) => void;
}

interface FakeConnection {
  handlers: Handlers;
  sendTask: ReturnType<typeof vi.fn>;
  resendTask: ReturnType<typeof vi.fn>;
  cancelTask: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  connections: [] as FakeConnection[],
  router: { push: vi.fn() },
  retry: vi.fn(),
  dictation: {
    isActive: false,
    status: 'idle',
    error: null as string | null,
    usageLimited: null as DictationLimit | null,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('../../lib/remote-dispatch-client', () => ({
  connectRemoteDispatch: mocks.connect,
}));
vi.mock('../../lib/browser-pairing', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  readBrowserPairing: (raw: string) => (raw.trim() ? { code: raw.trim(), secret: 'secret' } : null),
}));
vi.mock('@features/chat/hooks/use-dictation', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useDictation: () => ({
    ...mocks.dictation,
    bars: [],
    reducedMotion: false,
    cancel: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    retry: mocks.retry,
    start: vi.fn(),
  }),
}));
vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children, rail = true }: { children: React.ReactNode; rail?: boolean }) => (
    <div data-testid="web-app-shell" data-rail={String(rail)}>
      {children}
    </div>
  ),
}));

function useFakeRelay() {
  mocks.connections = [];
  mocks.connect.mockImplementation(async (_pairing: unknown, handlers: Handlers) => {
    const connection: FakeConnection = {
      handlers,
      sendTask: vi.fn().mockResolvedValue(`request-${mocks.connections.length}`),
      resendTask: vi.fn().mockResolvedValue(true),
      cancelTask: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    mocks.connections.push(connection);
    return connection;
  });
}

async function connectTo(link: string, computerName: string) {
  const before = mocks.connections.length;
  fireEvent.change(screen.getByLabelText('Pairing link'), { target: { value: link } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(mocks.connections.length).toBe(before + 1));
  const connection = mocks.connections[mocks.connections.length - 1]!;
  act(() => connection.handlers.onReady(computerName));
  await screen.findByText(`Connected to ${computerName}`);
  return connection;
}

async function sendTask(prompt: string) {
  fireEvent.change(screen.getByLabelText('Task'), { target: { value: prompt } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to computer' }));
  await screen.findByText(prompt);
}

async function disconnectAfterConfirming() {
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}

function rowFor(prompt: string): HTMLElement {
  return screen.getByText(prompt).closest('li') as HTMLElement;
}

describe('RemoteComputerPage task ownership', () => {
  beforeEach(() => {
    mocks.connect.mockReset();
    useFakeRelay();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [] }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks before disconnecting, because the pairing link stops working', async () => {
    render(<RemoteComputerPage />);
    const first = await connectTo('link-a', 'Computer A');

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('copy a new link from Desktop');
    expect(first.close).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(first.close).not.toHaveBeenCalled();
    expect(screen.getByText('Connected to Computer A')).toBeInTheDocument();

    await disconnectAfterConfirming();
    expect(first.close).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Pairing link')).toBeInTheDocument();
  });

  it('keeps controls for a task on the connection that sent it', async () => {
    render(<RemoteComputerPage />);
    const first = await connectTo('link-a', 'Computer A');
    await sendTask('build the report');
    act(() =>
      first.handlers.onTaskStatus({ requestId: 'request-0', status: 'running', taskId: 'task-a' }),
    );

    const row = rowFor('build the report');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(first.cancelTask).toHaveBeenCalledWith('request-0', 'task-a');
    expect(row).toHaveTextContent(runStatusLabel('running'));
  });

  it('does not route a retained task through a different computer or let it settle the row', async () => {
    render(<RemoteComputerPage />);
    const first = await connectTo('link-a', 'Computer A');
    await sendTask('build the report');
    act(() =>
      first.handlers.onTaskStatus({ requestId: 'request-0', status: 'running', taskId: 'task-a' }),
    );

    await disconnectAfterConfirming();
    const second = await connectTo('link-b', 'Computer B');

    const row = rowFor('build the report');
    expect(row).toHaveTextContent(runStatusLabel('running'));
    expect(row.querySelector('button')).toBeNull();
    expect(row).toHaveTextContent('Connection closed');
    expect(second.cancelTask).not.toHaveBeenCalled();

    act(() =>
      second.handlers.onTaskStatus({
        requestId: 'request-0',
        status: 'rejected',
        error: 'No matching task is running on this computer.',
      }),
    );

    expect(row).toHaveTextContent(runStatusLabel('running'));
    expect(row).not.toHaveTextContent('No matching task');
  });

  it('offers no resend for an unconfirmed task once its connection is gone', async () => {
    render(<RemoteComputerPage />);
    const first = await connectTo('link-a', 'Computer A');
    await sendTask('build the report');
    act(() =>
      first.handlers.onTaskStatus({
        requestId: 'request-0',
        status: 'queued',
        message: 'not confirmed',
        unconfirmed: true,
      }),
    );
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();

    await disconnectAfterConfirming();
    await connectTo('link-b', 'Computer B');

    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('says so when the computer connection refuses a cancel or a resend', async () => {
    render(<RemoteComputerPage />);
    const first = await connectTo('link-a', 'Computer A');
    await sendTask('build the report');
    act(() =>
      first.handlers.onTaskStatus({
        requestId: 'request-0',
        status: 'queued',
        message: 'not confirmed',
        unconfirmed: true,
      }),
    );

    first.resendTask.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent again');

    first.cancelTask.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('cancel request did not reach'),
    );
  });
});

describe('RemoteComputerPage dictation refusals', () => {
  beforeEach(() => {
    mocks.connect.mockReset();
    useFakeRelay();
    mocks.router.push.mockClear();
    mocks.retry.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [] }) }),
    );
  });

  afterEach(() => {
    mocks.dictation = { isActive: false, status: 'idle', error: null, usageLimited: null };
    vi.unstubAllGlobals();
  });

  function failDictation(error: string, usageLimited: DictationLimit | null) {
    mocks.dictation = { isActive: true, status: 'error', error, usageLimited };
  }

  it('offers Upgrade, not a retry, when the dictation allowance is spent', async () => {
    const openDialog = vi.fn();
    const stopListening = onAppCommand('open-upgrade', openDialog);
    try {
      render(<RemoteComputerPage />);
      await connectTo('link-a', 'Computer A');
      failDictation(
        'You’ve reached your usage limit. Type instead, or try again later.',
        'upgradable',
      );
      fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'draft' } });

      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    } finally {
      stopListening();
    }

    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it('falls back to the plans page where no plan dialog is listening', async () => {
    render(<RemoteComputerPage />);
    await connectTo('link-a', 'Computer A');
    failDictation(
      'You’ve reached your usage limit. Type instead, or try again later.',
      'upgradable',
    );
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(mocks.router.push).toHaveBeenCalledWith(PLANS_PAGE_PATH);
  });

  it('offers no Upgrade where no higher plan can lift the dictation limit', async () => {
    render(<RemoteComputerPage />);
    await connectTo('link-a', 'Computer A');
    failDictation('Your organization has reached its usage limit. Type instead.', 'not_upgradable');
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'draft' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your organization has reached its usage limit. Type instead.',
    );
    expect(screen.queryByRole('button', { name: 'Upgrade' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps a passing dictation failure retryable without an Upgrade', async () => {
    render(<RemoteComputerPage />);
    await connectTo('link-a', 'Computer A');
    failDictation('Too many recordings just now. Wait a moment, then try again.', null);
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'draft' } });

    expect(screen.queryByRole('button', { name: 'Upgrade' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule1 = typeof import('../../lib/browser-pairing');
type ImportedModule0 = typeof import('@features/chat/hooks/use-dictation');

describe('RemoteComputerScreen', () => {
  const wideWidth = window.innerWidth;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ devices: [] }) })),
    );
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: wideWidth });
    vi.unstubAllGlobals();
  });

  it('gives a phone the app header with its navigation button', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<RemoteComputerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('web-app-shell')).toHaveAttribute('data-rail', 'true'),
    );
    expect(screen.getByRole('heading', { name: 'Your computer' })).toBeInTheDocument();
  });

  it('keeps a wide screen free of the app navigation', async () => {
    render(<RemoteComputerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('web-app-shell')).toHaveAttribute('data-rail', 'false'),
    );
  });
});
