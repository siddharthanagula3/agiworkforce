/**
 * Regression test for the "delete project is a fake success" data-integrity bug.
 *
 * Live audit (2026-07-10, section 9): clicking Project settings > Delete project
 * > confirm showed a green "Project deleted" toast but fired ZERO DELETE
 * requests — the project survived a full reload. Root cause: `handleDelete`
 * only mutated the local store and toasted success without ever calling the
 * server. These tests pin the fix: a real DELETE /api/projects/[id] must fire,
 * the local removal + success toast must happen only AFTER the server confirms,
 * and a failed request must surface an error toast without removing the project.
 */

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

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));

// KnowledgeFilesPanel fires its own network requests on mount; stub it out so
// the test observes only the delete request.
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
  // Confirm button inside the AlertDialog.
  const confirm = await screen.findByRole('button', { name: /^delete$/i });
  await user.click(confirm);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectSettingsDialog — delete fires a real server request', () => {
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
