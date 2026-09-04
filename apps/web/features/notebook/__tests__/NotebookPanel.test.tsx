import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CloudCodeSession, NotebookCellOutput } from '@agiworkforce/types';
import { NotebookPanel } from '../NotebookPanel';
import type { NotebookApi } from '../services/notebook-api';

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
  lastError: null,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T12:00:00.000Z',
  closedAt: null,
};

function createApi(overrides: Partial<NotebookApi> = {}): NotebookApi {
  return {
    execute: vi.fn(async () => ({ session, ok: true, outputs: [] as NotebookCellOutput[] })),
    listFiles: vi.fn(async () => ({ session, files: [] })),
    uploadFile: vi.fn(async () => ({
      session,
      file: { path: 'data.csv', name: 'data.csv', isDir: false, byteSize: 12 },
    })),
    downloadUrl: vi.fn(
      (sessionId: string, path: string) => `/api/code/sessions/${sessionId}/notebook/files/${path}`,
    ),
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
    const link = within(row.closest('li')!).getByRole('link', { name: 'Download data.csv' });
    expect(link).toHaveAttribute(
      'href',
      `/api/code/sessions/${session.id}/notebook/files/data.csv`,
    );
  });

  it('disables cell controls while the session is not ready', () => {
    const api = createApi();
    render(
      <NotebookPanel sessionId={session.id} sessionReady={false} api={api} onSession={vi.fn()} />,
    );

    expect(screen.getByLabelText('Cell 1 code')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add cell' })).toBeDisabled();
  });
});
