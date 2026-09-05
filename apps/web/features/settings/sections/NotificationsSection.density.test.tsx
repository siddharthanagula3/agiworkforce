import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: vi.fn(async () => ({})),
  savePreferenceNamespace: vi.fn(async () => {}),
}));

vi.mock('@/features/notifications', () => ({
  WebPushToggle: () => <button type="button" role="switch" aria-label="Browser notifications" />,
}));

import { NotificationsSection } from './NotificationsSection';

describe('NotificationsSection row density', () => {
  it('renders no prose card and no lingering loading text once preferences resolve', async () => {
    render(<NotificationsSection />);

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
  });
});
