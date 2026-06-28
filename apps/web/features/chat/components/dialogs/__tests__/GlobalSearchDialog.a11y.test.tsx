import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// No signed-in user → the mount effect skips history loading and no search
// service call runs; we only care about the dialog's accessible structure.
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({ user: null }),
}));

import { GlobalSearchDialog } from '../GlobalSearchDialog';

afterEach(cleanup);

describe('GlobalSearchDialog accessibility (a11y regression)', () => {
  it('exposes an accessible description on the search dialog (no Radix Missing-Description warning)', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const dialog = screen.getByRole('dialog');
    // aria-describedby must resolve to the sr-only DialogDescription.
    expect(dialog).toHaveAccessibleDescription('Search across your conversations and messages.');
    // And it keeps its accessible name (the title).
    expect(dialog).toHaveAccessibleName(/search conversations/i);
  });

  it('gives the search input a stable accessible name independent of the placeholder', () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    expect(
      screen.getByRole('textbox', { name: /search messages and conversations/i }),
    ).toBeInTheDocument();
  });
});
