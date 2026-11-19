import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStatusLabel } from '@agiworkforce/types';
import { RemoteComputerPage, RemoteComputerScreen } from '../RemoteComputerPage';
import type { RemoteTaskStatus } from '../../lib/remote-dispatch-client';

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
    isActive: false,
    status: 'idle',
    bars: [],
    error: null,
    reducedMotion: false,
    cancel: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    retry: vi.fn(),
    start: vi.fn(),
  }),
}));
vi.mock('@features/chat/components/Composer/DictationStrip', () => ({
  DictationStrip: () => null,
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

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
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
