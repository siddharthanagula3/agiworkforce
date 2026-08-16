import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: null }),
}));

import { GlobalSearchDialog } from '../GlobalSearchDialog';

afterEach(cleanup);

describe('GlobalSearchDialog accessibility (a11y regression)', () => {
  it('exposes an accessible description on the search dialog (no Radix Missing-Description warning)', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('Search across your conversations and messages.');
    expect(dialog).toHaveAccessibleName(/search conversations/i);
  });

  it('gives the search input a stable accessible name independent of the placeholder', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    expect(
      screen.getByRole('textbox', { name: /search messages and conversations/i }),
    ).toBeInTheDocument();
  });
});
