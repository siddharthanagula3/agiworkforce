import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { FolderSelector } from './FolderSelector';
import { useProjectStore } from '../../stores/projectStore';

const invokeMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('FolderSelector backend context sync', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useProjectStore.setState({
      currentFolder: null,
      recentFolders: [],
    });
  });

  it('syncs persisted current folder to backend context on mount', async () => {
    useProjectStore.setState({
      currentFolder: '/Users/siddhartha/Documents',
      recentFolders: ['/Users/siddhartha/Documents'],
    });
    invokeMock.mockResolvedValue(undefined);

    render(<FolderSelector />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('project_context_set_folder', {
        path: '/Users/siddhartha/Documents',
      });
    });
  });

  it('clears persisted folder locally when backend validation fails', async () => {
    useProjectStore.setState({
      currentFolder: '/invalid/path',
      recentFolders: ['/invalid/path'],
    });
    invokeMock.mockRejectedValue(new Error('folder not found'));

    render(<FolderSelector />);

    await waitFor(() => {
      expect(useProjectStore.getState().currentFolder).toBeNull();
    });
  });
});
