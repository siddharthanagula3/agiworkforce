import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsDialogStore } from '@/stores/settingsDialogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ComposerContextControls } from './ComposerContextControls';

const gitStatusMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/git', () => ({
  gitStatus: gitStatusMock,
}));

vi.mock('@/lib/tauri-mock', () => ({
  isTauri: true,
  isTauriContext: () => true,
}));

describe('ComposerContextControls', () => {
  beforeEach(() => {
    gitStatusMock.mockReset();
    gitStatusMock.mockResolvedValue({
      branch: 'feature/audit',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
    });
    useSettingsDialogStore.setState({
      settingsOpen: false,
      settingsInitialTab: 'general',
    });
    useSettingsStore.setState((state) => ({
      chatPreferences: {
        ...state.chatPreferences,
        autoApproveTools: false,
      },
      executionPreferences: {
        ...state.executionPreferences,
        terminalSandbox: {
          ...state.executionPreferences.terminalSandbox,
          enabled: true,
          backend: 'srt',
          policy: 'workspace-write',
        },
      },
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('shows enforcement-backed local policy, folder, and live branch context', async () => {
    const user = userEvent.setup();
    render(
      <ComposerContextControls
        mode="local"
        folderPath="/workspace/agiworkforce"
        folderLabel="agiworkforce"
        onSelectFolder={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Active execution context')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Terminal: Workspace write. Open agent execution settings',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Workspace agiworkforce. Change folder' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('feature/audit')).toBeInTheDocument();
    expect(gitStatusMock).toHaveBeenCalledWith('/workspace/agiworkforce');

    await user.click(
      screen.getByRole('button', {
        name: 'Terminal: Workspace write. Open agent execution settings',
      }),
    );
    await waitFor(() => {
      expect(useSettingsDialogStore.getState()).toMatchObject({
        settingsOpen: true,
        settingsInitialTab: 'agent-execution',
      });
    });
  });

  it('warns when the sandbox is off and does not invent a Cloud git branch', () => {
    useSettingsStore.setState((state) => ({
      executionPreferences: {
        ...state.executionPreferences,
        terminalSandbox: {
          ...state.executionPreferences.terminalSandbox,
          enabled: false,
        },
      },
    }));

    render(
      <ComposerContextControls
        mode="managed"
        folderPath="/workspace/agiworkforce"
        folderLabel="agiworkforce"
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Terminal: Sandbox off. Open agent execution settings',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.queryByText('feature/audit')).not.toBeInTheDocument();
    expect(gitStatusMock).not.toHaveBeenCalled();
  });

  it('keeps automatic approval risk visible at the point of execution', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState((state) => ({
      chatPreferences: {
        ...state.chatPreferences,
        autoApproveTools: true,
      },
    }));

    render(<ComposerContextControls mode="local" folderPath={null} folderLabel={null} />);

    const warning = screen.getByRole('button', {
      name: 'Approvals: Automatic. Open agent execution settings',
    });
    expect(warning).toHaveTextContent('Approvals: Auto');

    await user.click(warning);
    await waitFor(() => {
      expect(useSettingsDialogStore.getState()).toMatchObject({
        settingsOpen: true,
        settingsInitialTab: 'agent-execution',
      });
    });
  });
});
