import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { AgentTaskPanel } from '@/features/agi/AgentTaskPanel';
import { invoke } from '@/lib/tauri-mock';
import { useNotificationTargetStore } from '@/features/notifications/notificationTarget';

const TAB_NAMES = ['Create', 'Monitor', 'Scheduled', 'Agents', 'Background'];

describe('AgentTaskPanel tabs', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('exposes a tablist whose selected tab labels the panel', () => {
    render(<AgentTaskPanel />);

    const tabs = within(screen.getByRole('tablist', { name: 'Tasks' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(TAB_NAMES);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.slice(1).every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);

    const panel = screen.getByRole('tabpanel');
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]!.id);
  });

  it('keeps one tab in the tab order and moves selection with the arrow keys', () => {
    render(<AgentTaskPanel />);
    const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });

    expect(tab('Create')).toHaveAttribute('tabindex', '0');
    expect(tab('Monitor')).toHaveAttribute('tabindex', '-1');

    tab('Create').focus();
    fireEvent.keyDown(tab('Create'), { key: 'ArrowRight' });
    expect(tab('Monitor')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Monitor')).toHaveFocus();
    expect(tab('Create')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Monitor').id);

    fireEvent.keyDown(tab('Monitor'), { key: 'ArrowLeft' });
    fireEvent.keyDown(tab('Create'), { key: 'ArrowLeft' });
    expect(tab('Background')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Background')).toHaveFocus();

    fireEvent.keyDown(tab('Background'), { key: 'ArrowRight' });
    expect(tab('Create')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tab('Create'), { key: 'End' });
    expect(tab('Background')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Background'), { key: 'Home' });
    expect(tab('Create')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Create')).toHaveFocus();
  });

  it('leaves other keys alone', () => {
    render(<AgentTaskPanel />);
    const create = screen.getByRole('tab', { name: /^Create/ });

    fireEvent.keyDown(create, { key: 'a' });
    expect(create).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Background tab when a notification names a background agent', async () => {
    render(<AgentTaskPanel />);
    expect(screen.getByRole('tab', { name: /^Create/ })).toHaveAttribute('aria-selected', 'true');

    act(() => {
      useNotificationTargetStore.getState().request({ kind: 'background-agent', id: 'agent-1' });
    });

    expect(screen.getByRole('tab', { name: /^Background/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => expect(useNotificationTargetStore.getState().pending).toBeNull());
  });
});
