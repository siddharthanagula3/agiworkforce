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

const TAB_NAMES = ['Scheduled', 'Agents', 'Background'];

describe('AgentTaskPanel tabs', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command: string) =>
      command === 'scheduler_list_jobs' ? [] : undefined,
    );
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

    expect(tab('Scheduled')).toHaveAttribute('tabindex', '0');
    expect(tab('Agents')).toHaveAttribute('tabindex', '-1');

    tab('Scheduled').focus();
    fireEvent.keyDown(tab('Scheduled'), { key: 'ArrowRight' });
    expect(tab('Agents')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Agents')).toHaveFocus();
    expect(tab('Scheduled')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Agents').id);

    fireEvent.keyDown(tab('Agents'), { key: 'ArrowLeft' });
    fireEvent.keyDown(tab('Scheduled'), { key: 'ArrowLeft' });
    expect(tab('Background')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Background')).toHaveFocus();

    fireEvent.keyDown(tab('Background'), { key: 'ArrowRight' });
    expect(tab('Scheduled')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tab('Scheduled'), { key: 'End' });
    expect(tab('Background')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Background'), { key: 'Home' });
    expect(tab('Scheduled')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Scheduled')).toHaveFocus();
  });

  it('leaves other keys alone', () => {
    render(<AgentTaskPanel />);
    const scheduled = screen.getByRole('tab', { name: /^Scheduled/ });

    fireEvent.keyDown(scheduled, { key: 'a' });
    expect(scheduled).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Background tab when a notification names a background agent', async () => {
    render(<AgentTaskPanel />);
    expect(screen.getByRole('tab', { name: /^Scheduled/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

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
