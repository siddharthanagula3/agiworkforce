import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => {}),
  webPush: {
    checked: false,
    disabled: false,
    description: 'Get told when a run finishes, fails, or needs your approval.',
    blocked: false,
    onCheckedChange: vi.fn(),
  },
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: mocks.fetchPreferenceNamespace,
  savePreferenceNamespace: mocks.savePreferenceNamespace,
}));

vi.mock('@/features/notifications', () => ({
  useWebPushToggle: () => mocks.webPush,
}));

import { NotificationsSection } from './NotificationsSection';

describe('NotificationsSection row density', () => {
  it('renders no prose card and shows no saved state until something changes', async () => {
    render(<NotificationsSection />);

    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
  });

  it('shows a saved state only after an actual change', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Reply ready' }), 'off');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('shows one description line: the blocked sentence when blocked', async () => {
    mocks.webPush.blocked = true;
    mocks.webPush.description = 'Notifications are blocked for this site in your browser settings.';

    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    const runRow = screen.getByText('Agent run updates').closest('section');
    expect(runRow?.textContent).toContain('blocked for this site');
    expect(runRow?.textContent).not.toContain('Applies only to this browser');

    mocks.webPush.blocked = false;
  });

  it('shows one description line: the browser-scope note otherwise', async () => {
    mocks.webPush.blocked = false;

    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    const runRow = screen.getByText('Agent run updates').closest('section');
    expect(runRow?.textContent).toContain('Applies only to this browser');
    expect(runRow?.textContent).not.toContain('blocked for this site');
  });
});
