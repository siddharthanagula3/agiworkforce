import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionSidecar } from '../ExecutionSidecar';
import { useExecutionSidecarStore } from '../../../stores/executionSidecarStore';
import { useProjectStore } from '../../../stores/projectStore';
import { invoke } from '../../../lib/tauri-mock';

const mockInvoke = vi.mocked(invoke);

describe('Changes in the execution sidecar', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'git_status') {
        return Promise.resolve({
          branch: 'main',
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: ['src/app.ts'],
          untracked: [],
          conflicts: [],
        });
      }
      if (command === 'git_list_branches') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    useExecutionSidecarStore.getState().reset();
    useProjectStore.setState({ currentFolder: '/repo' });
  });

  afterEach(cleanup);

  it('opens on Cmd/Ctrl+Shift+G showing the changes in the chat folder', async () => {
    render(<ExecutionSidecar />);
    expect(screen.queryByText('src/app.ts')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'G', metaKey: true, shiftKey: true });

    expect(await screen.findByText('src/app.ts')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('git_status', { path: '/repo' });
  });

  it('closes again on the same shortcut', async () => {
    render(<ExecutionSidecar />);
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true, shiftKey: true });
    await screen.findByText('src/app.ts');

    act(() => {
      fireEvent.keyDown(window, { key: 'g', ctrlKey: true, shiftKey: true });
    });

    expect(useExecutionSidecarStore.getState().isOpen).toBe(false);
    expect(screen.queryByText('src/app.ts')).not.toBeInTheDocument();
  });

  it('offers Changes as a tab next to the other execution views', async () => {
    useExecutionSidecarStore.getState().open();
    render(<ExecutionSidecar />);

    fireEvent.click(screen.getByTitle('Changes'));

    expect(useExecutionSidecarStore.getState().userOverrideContext).toBe('changes');
    expect(await screen.findByText('src/app.ts')).toBeInTheDocument();
  });
});
