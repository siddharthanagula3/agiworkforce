import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));

vi.mock('../KnowledgeFilesPanel', () => ({
  KnowledgeFilesPanel: () => null,
}));

import { ProjectSettingsDialog } from '../ProjectSettingsDialog';
import type { Project } from '@features/projects/stores/project-store';

const PROJECT = {
  id: 'proj_abc123',
  name: 'QA Test Project',
  instructions: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  conversationIds: [],
} as unknown as Project;

function renderDialog(overrides: Partial<React.ComponentProps<typeof ProjectSettingsDialog>> = {}) {
  const onDelete = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ProjectSettingsDialog
      open
      onOpenChange={onOpenChange}
      project={PROJECT}
      onUpdate={vi.fn()}
      onDelete={onDelete}
      {...overrides}
    />,
  );
  return { onDelete, onOpenChange };
}

async function openConfirmAndDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /delete project/i }));
  const confirm = await screen.findByRole('button', { name: /^delete$/i });
  await user.click(confirm);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectSettingsDialog, delete fires a real server request', () => {
  it('does not expose the deferred emoji picker as an enabled no-op button', () => {
    renderDialog();

    expect(screen.queryByRole('button', { name: /choose emoji/i })).toBeNull();
  });

  it('exposes export as a document download link instead of client-side routing', () => {
    renderDialog();

    expect(screen.getByRole('link', { name: /export/i })).toHaveAttribute(
      'href',
      '/api/projects/proj_abc123/export',
    );
  });

  it('keeps every project action reachable in the narrow two-column layout', () => {
    renderDialog();

    expect(screen.getByTestId('project-settings-actions').className.split(' ')).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-2', 'sm:flex']),
    );
    expect(screen.getByRole('button', { name: 'Save' }).className.split(' ')).toEqual(
      expect.arrayContaining(['col-span-2', 'w-full', 'sm:w-auto']),
    );
    expect(screen.getByRole('button', { name: /delete project/i }).className.split(' ')).toEqual(
      expect.arrayContaining(['col-span-2', 'w-full', 'sm:w-auto']),
    );
  });

  it('warns that knowledge files and their uploaded contents go with the project', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /delete project/i }));

    const confirm = await screen.findByRole('button', { name: /^delete$/i });
    const warning = confirm.closest('[role="alertdialog"]')?.textContent ?? '';
    expect(warning).toMatch(/knowledge files/i);
    expect(warning).toMatch(/uploaded file contents/i);
    expect(warning).toMatch(/cannot be undone/i);
  });

  it('sends DELETE /api/projects/[id], then removes locally and toasts success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const { onDelete, onOpenChange } = renderDialog();
    await openConfirmAndDelete(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/projects/proj_abc123');
    expect((init as RequestInit).method).toBe('DELETE');

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('proj_abc123'));
    expect(toastSuccess).toHaveBeenCalledWith('Project deleted');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    vi.unstubAllGlobals();
  });

  it('does NOT remove the project or toast success when the server delete fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const { onDelete } = renderDialog();
    await openConfirmAndDelete(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onDelete).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
