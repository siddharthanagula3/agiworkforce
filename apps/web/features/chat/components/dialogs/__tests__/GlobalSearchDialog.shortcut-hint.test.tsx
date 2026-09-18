import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: null }),
}));

import { GlobalSearchDialog } from '../GlobalSearchDialog';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { findShortcutDoc, formatShortcutKeys } from '../../../hooks/use-keyboard-shortcuts';

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [] });
});
afterEach(cleanup);

describe('GlobalSearchDialog keyboard shortcut hint', () => {
  it('names every key of the binding that actually opens this dialog', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);

    const doc = findShortcutDoc('open-search');
    expect(doc).toBeDefined();
    const keys = formatShortcutKeys(doc!, false);
    expect(keys).toEqual(['Ctrl', 'Shift', 'F']);

    for (const key of keys) {
      expect(screen.getAllByText(key).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/to reopen search/i)).toBeInTheDocument();
  });

  it('advertises nothing once the user switches that shortcut off', () => {
    useSettingsStore.setState({ disabledShortcutIds: ['open-search'] });
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);

    expect(screen.queryByText(/to reopen search/i)).not.toBeInTheDocument();
    expect(screen.getByText(/to close/i)).toBeInTheDocument();
  });

  it('clears the typed query from the field', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: /search messages and conversations/i });

    fireEvent.change(input, { target: { value: 'quarterly plan' } });
    expect(input).toHaveValue('quarterly plan');

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect(input).toHaveValue('');
  });
});
