import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsSection } from './NotificationsSection';

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: mocks.fetchPreferenceNamespace,
  savePreferenceNamespace: mocks.savePreferenceNamespace,
}));

vi.mock('@agiworkforce/ui', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...rest
  }: {
    checked: boolean;
    onCheckedChange: () => void;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      onClick={() => onCheckedChange()}
    />
  ),
}));

beforeEach(() => {
  mocks.fetchPreferenceNamespace.mockReset();
  mocks.savePreferenceNamespace.mockReset();
  mocks.fetchPreferenceNamespace.mockResolvedValue({
    browserReplyReady: true,
    emailScheduleDone: false,
    mobilePushScheduleDone: false,
  });
  mocks.savePreferenceNamespace.mockResolvedValue(undefined);
});

describe('NotificationsSection grouping', () => {
  it('lists each event once and offers its channels inside it', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Synced to your account')).toBeInTheDocument());

    expect(screen.getAllByText('Scheduled task finished')).toHaveLength(1);

    const scheduleEvent = screen.getByRole('region', { name: 'Scheduled task finished' });
    expect(within(scheduleEvent).getByText('Email')).toBeInTheDocument();
    expect(within(scheduleEvent).getByText('Mobile push')).toBeInTheDocument();

    const replyEvent = screen.getByRole('region', { name: 'Reply ready' });
    expect(within(replyEvent).getByText('Browser')).toBeInTheDocument();
    expect(within(replyEvent).queryByText('Email')).not.toBeInTheDocument();
  });

  it('names every switch by event and channel', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Synced to your account')).toBeInTheDocument());

    expect(screen.getByRole('switch', { name: 'Reply ready, Browser' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Scheduled task finished, Email' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      screen.getByRole('switch', { name: 'Scheduled task finished, Mobile push' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('saves the channel key behind the switch that was toggled', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Synced to your account')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('switch', { name: 'Scheduled task finished, Mobile push' }));

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith('notifications', {
        browserReplyReady: true,
        emailScheduleDone: false,
        mobilePushScheduleDone: true,
      }),
    );
  });
});
