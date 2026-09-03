import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useMemoryStore } from '@agiworkforce/unified-chat';

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(async (_namespace: string, _value: unknown) => undefined);

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) =>
    fetchPreferenceNamespace(...(args as [string, unknown])),
  savePreferenceNamespace: (...args: unknown[]) =>
    savePreferenceNamespace(...(args as [string, unknown])),
  fetchStoredPreferenceNamespace: async () => ({}),
}));

vi.mock('@/lib/runtime/memory-capability', () => ({
  resetMemoryCapabilityCache: vi.fn(),
}));

import { MemorySection } from '../MemorySection';

function fact(over: Record<string, unknown> = {}) {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    text: 'Ships on Fridays.',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
}

describe('MemorySection top-level settings entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    useMemoryStore.setState({ facts: [], syncStatus: 'idle' });
  });

  it('renders a persistent memory toggle that saves the capabilities namespace', async () => {
    const user = userEvent.setup();
    render(<MemorySection />);

    const toggle = await screen.findByRole('switch', { name: 'Persistent memory' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    await waitFor(() =>
      expect(savePreferenceNamespace).toHaveBeenCalledWith(
        'capabilities',
        expect.objectContaining({ memory: true }),
      ),
    );
  });

  it('shows a live count of saved memories', () => {
    useMemoryStore.setState({
      facts: [fact(), fact(), fact()],
      syncStatus: 'idle',
    });

    render(<MemorySection />);

    expect(screen.getByText('3 saved memories')).toBeVisible();
  });

  it('disables Manage memories and Clear all memories when there are none', () => {
    render(<MemorySection />);

    expect(screen.getByRole('button', { name: 'Manage memories' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear all memories' })).toBeDisabled();
  });

  it('asks for confirmation before clearing all memories, then clears the store', async () => {
    useMemoryStore.setState({ facts: [fact(), fact()], syncStatus: 'idle' });
    const user = userEvent.setup();
    render(<MemorySection />);

    await user.click(screen.getByRole('button', { name: 'Clear all memories' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete all memory facts?');
    expect(useMemoryStore.getState().facts).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Forget everything' }));

    await waitFor(() => expect(useMemoryStore.getState().facts).toHaveLength(0));
  });
});
