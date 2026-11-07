import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudCodeSession, NotebookCellOutput } from '@agiworkforce/types';
import { NotebookPanel as Panel, type NotebookPanelProps } from '../NotebookPanel';
import type { NotebookApi } from '../services/notebook-api';
import { createNotebookWorkspace } from '../services/notebook-workspace';

function NotebookPanel({
  api,
  ...props
}: Omit<NotebookPanelProps, 'workspace'> & { api: NotebookApi }) {
  const [workspace] = useState(() =>
    createNotebookWorkspace(
      () => ({ api, isCurrent: () => true, retire: () => undefined }),
      () => true,
    ),
  );
  return <Panel {...props} workspace={workspace} />;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

const session: CloudCodeSession = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Notebook workspace',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'none',
  runtimeId: 'code-interpreter-v1',
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  workingBranch: null,
  baseBranch: null,
  pullRequestUrl: null,
  pullRequestNumber: null,
  archivedAt: null,
  contextInputTokens: 0,
  contextOutputTokens: 0,
  lastError: null,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  closedAt: null,
};

function createApi(overrides: Partial<NotebookApi> = {}): NotebookApi {
  return {
    execute: vi.fn(async () => ({ session, ok: true, outputs: [] as NotebookCellOutput[] })),
    runAll: vi.fn(async () => ({
      session,
      runId: '22222222-2222-4222-8222-222222222222',
      fromTop: true,
      networkAccess: 'none' as const,
      completed: true,
      results: [],
    })),
    listFiles: vi.fn(async () => ({ session, files: [] })),
    uploadFile: vi.fn(async () => ({
      session,
      file: { path: 'data.csv', name: 'data.csv', isDir: false, byteSize: 12 },
    })),
    downloadUrl: (sessionId, path) => `/api/code/sessions/${sessionId}/notebook/files/${path}`,
    ...overrides,
  };
}

describe('NotebookPanel', () => {
  it('runs a cell and renders its ordered outputs', async () => {
    const user = userEvent.setup();
    const api = createApi({
      execute: vi.fn(async () => ({
        session,
        ok: true,
        outputs: [
          { kind: 'stream', data: 'hello\n' },
          { kind: 'html', data: '<table><tr><td>1</td></tr></table>' },
          { kind: 'image', data: 'ZmFrZS1wbmc=' },
        ] as NotebookCellOutput[],
      })),
    });
    const onSession = vi.fn();

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={onSession} />);

    const codeField = screen.getByLabelText('Cell 1 code');
    await user.type(codeField, 'print(1)');
    await user.click(screen.getByRole('button', { name: 'Run cell 1' }));

    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith(session.id, {
        cellId: expect.any(String),
        code: 'print(1)',
        language: 'python',
      }),
    );
    expect(onSession).toHaveBeenCalledWith(session);
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cell output' })).toHaveAttribute(
      'src',
      'data:image/png;base64,ZmFrZS1wbmc=',
    );
  });

  it('marks a failed cell and surfaces the error text', async () => {
    const user = userEvent.setup();
    const api = createApi({
      execute: vi.fn(async () => ({
        session,
        ok: false,
        outputs: [{ kind: 'error', data: 'NameError: x is not defined' }] as NotebookCellOutput[],
        error: 'NameError: x is not defined',
      })),
    });

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);

    await user.type(screen.getByLabelText('Cell 1 code'), 'print(x)');
    await user.click(screen.getByRole('button', { name: 'Run cell 1' }));

    expect(await screen.findByText('NameError: x is not defined')).toBeInTheDocument();
  });

  it('adds a cell and runs it with Shift+Enter, focusing the new cell', async () => {
    const user = userEvent.setup();
    const api = createApi();

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);

    const codeField = screen.getByLabelText('Cell 1 code');
    await user.type(codeField, '1 + 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    await waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Cell 2 code')).toHaveFocus());
  });

  it('uploads a file and lists it for download', async () => {
    const user = userEvent.setup();
    const api = createApi({
      listFiles: vi
        .fn()
        .mockResolvedValueOnce({ session, files: [] })
        .mockResolvedValue({
          session,
          files: [{ path: 'data.csv', name: 'data.csv', isDir: false, byteSize: 2048 }],
        }),
    });

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);

    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('Upload file', { selector: 'input' });
    await user.upload(input, file);

    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledWith(session.id, file, 'data.csv'));
    const row = await screen.findByText('data.csv');
    expect(
      within(row.closest('li')!).getByRole('link', { name: 'Download data.csv' }),
    ).toHaveAttribute('href', `/api/code/sessions/${session.id}/notebook/files/data.csv`);
  });

  it('runs every code cell in one recorded run and reports what it covered', async () => {
    const user = userEvent.setup();
    const api = createApi({
      runAll: vi.fn(async (_sessionId, input) => ({
        session,
        runId: '22222222-2222-4222-8222-222222222222',
        fromTop: true,
        networkAccess: 'none' as const,
        completed: true,
        results: input.cells.map((cell) => ({
          cellId: cell.id,
          ok: true,
          outputs: [] as NotebookCellOutput[],
        })),
      })),
    });

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);

    await user.type(screen.getByLabelText('Cell 1 code'), '1 + 1');
    await user.click(screen.getByRole('button', { name: /Run all/ }));

    await waitFor(() => expect(api.runAll).toHaveBeenCalledTimes(1));
    const input = (api.runAll as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(input).toMatchObject({ fromTop: true });
    expect(input.cells).toHaveLength(1);
    expect(await screen.findByText(/Ran 1 cell from the top/)).toBeInTheDocument();
  });

  it('never sends a markdown cell to the sandbox and renders it instead', async () => {
    const user = userEvent.setup();
    const api = createApi();

    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add markdown' }));
    const notes = screen.getByLabelText('Cell 2 notes');
    await user.type(notes, '# Method');

    expect(screen.queryByRole('button', { name: 'Run cell 2' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Method' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Cell 1 code'), '1 + 1');
    await user.click(screen.getByRole('button', { name: /Run all/ }));
    await waitFor(() => expect(api.runAll).toHaveBeenCalledTimes(1));
    const input = (api.runAll as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(input.cells).toHaveLength(1);
    expect(input.cells[0].code).toBe('1 + 1');
  });

  it('disables cell controls while the session is not ready', () => {
    const api = createApi();
    render(
      <NotebookPanel sessionId={session.id} sessionReady={false} api={api} onSession={vi.fn()} />,
    );

    expect(screen.getByLabelText('Cell 1 code')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add cell' })).toBeDisabled();
  });

  it('keeps A and B drafts separate and settles A without publishing into B', async () => {
    const user = userEvent.setup();
    const run = deferred<Awaited<ReturnType<NotebookApi['execute']>>>();
    const api = createApi({
      execute: vi.fn(() => run.promise),
      listFiles: vi.fn(async (id) => ({ session: { ...session, id }, files: [] })),
    });
    const onSession = vi.fn();
    const workspace = createNotebookWorkspace(
      () => ({ api, isCurrent: () => true, retire: () => undefined }),
      () => true,
    );
    const otherId = '33333333-3333-4333-8333-333333333333';
    const { rerender } = render(
      <Panel
        sessionId={session.id}
        sessionReady
        workspace={workspace}
        onSession={onSession}
        selectionRevision={1}
      />,
    );
    await user.type(screen.getByLabelText('Cell 1 code'), 'input A');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Run cell 1' }));
    rerender(
      <Panel
        sessionId={otherId}
        sessionReady
        workspace={workspace}
        onSession={onSession}
        selectionRevision={2}
      />,
    );
    expect(screen.getByLabelText('Cell 1 code')).toHaveValue('');
    await user.type(screen.getByLabelText('Cell 1 code'), 'input B');
    await act(async () => {
      run.resolve({ session, ok: true, outputs: [{ kind: 'stream', data: 'output A' }] });
      await run.promise;
    });
    expect(screen.queryByText('output A')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cell 1 code')).toHaveValue('input B');
    expect(onSession).not.toHaveBeenCalled();
    rerender(
      <Panel
        sessionId={session.id}
        sessionReady
        workspace={workspace}
        onSession={onSession}
        selectionRevision={3}
      />,
    );
    expect(screen.getByLabelText('Cell 1 code')).toHaveValue('input A');
    expect(screen.getByText('output A')).toBeInTheDocument();
  });

  it('retains the run lock and input when the notebook panel is temporarily unmounted', async () => {
    const user = userEvent.setup();
    const run = deferred<Awaited<ReturnType<NotebookApi['execute']>>>();
    const api = createApi({ execute: vi.fn(() => run.promise) });
    const workspace = createNotebookWorkspace(
      () => ({ api, isCurrent: () => true, retire: () => undefined }),
      () => true,
    );
    const props = { sessionId: session.id, sessionReady: true, workspace, onSession: vi.fn() };
    const { rerender } = render(<Panel {...props} />);
    await user.type(screen.getByLabelText('Cell 1 code'), 'original input');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Run cell 1' }));
    rerender(<div>Another Code view</div>);
    rerender(<Panel {...props} />);
    expect(screen.getByLabelText('Cell 1 code')).toHaveValue('original input');
    expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeDisabled();
    expect(api.execute).toHaveBeenCalledTimes(1);
    await act(async () => {
      run.resolve({ session, ok: true, outputs: [] });
      await run.promise;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeEnabled());
    expect(props.onSession).not.toHaveBeenCalled();
  });

  it('renders uncertain single-cell execution errors and keeps the submitted input', async () => {
    const user = userEvent.setup();
    const api = createApi({
      execute: vi.fn(async () => {
        throw new Error('connection lost');
      }),
    });
    render(<NotebookPanel sessionId={session.id} sessionReady api={api} onSession={vi.fn()} />);
    await user.type(screen.getByLabelText('Cell 1 code'), 'expensive_work()');
    await user.click(screen.getByRole('button', { name: 'Run cell 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Code may have run');
    expect(screen.getByLabelText('Cell 1 code')).toHaveValue('expensive_work()');
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it('rechecks selection inside the deferred advance-focus callback', async () => {
    const user = userEvent.setup();
    const api = createApi({
      listFiles: vi.fn(async (id) => ({ session: { ...session, id }, files: [] })),
    });
    const workspace = createNotebookWorkspace(
      () => ({ api, isCurrent: () => true, retire: () => undefined }),
      () => true,
    );
    const props = { sessionReady: true, workspace, onSession: vi.fn() };
    const { rerender } = render(<Panel {...props} sessionId={session.id} selectionRevision={1} />);
    await user.type(screen.getByLabelText('Cell 1 code'), '1 + 1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run cell 1' })).toBeEnabled());
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    rerender(
      <Panel {...props} sessionId="33333333-3333-4333-8333-333333333333" selectionRevision={2} />,
    );
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    act(() => {
      frames.forEach((callback) => callback(0));
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it('offers an explicit refresh after an interrupted initial listing without retrying automatically', async () => {
    const user = userEvent.setup();
    const initial = deferred<Awaited<ReturnType<NotebookApi['listFiles']>>>();
    const api = createApi({
      listFiles: vi
        .fn()
        .mockImplementationOnce(() => initial.promise)
        .mockResolvedValue({
          session,
          files: [{ path: 'fresh.txt', name: 'fresh.txt', byteSize: 1, isDir: false }],
        }),
    });
    let generation = 1;
    const workspace = createNotebookWorkspace(
      () => {
        const captured = generation;
        return { api, isCurrent: () => captured === generation, retire: () => undefined };
      },
      () => true,
    );
    render(<Panel sessionId={session.id} sessionReady workspace={workspace} onSession={vi.fn()} />);
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Refresh files' })).toBeDisabled();
    generation += 1;
    await act(async () => {
      initial.resolve({ session, files: [] });
      await initial.promise;
    });
    expect(await screen.findByText(/The file list could not be confirmed/)).toBeInTheDocument();
    expect(api.listFiles).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Refresh files' }));
    expect(await screen.findByText('fresh.txt')).toBeInTheDocument();
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/The file list could not be confirmed/)).not.toBeInTheDocument();
  });
});
