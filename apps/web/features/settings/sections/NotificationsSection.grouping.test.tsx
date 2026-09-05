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

vi.mock('@/features/notifications', () => ({
  WebPushToggle: () => <button type="button" role="switch" aria-label="Agent run updates" />,
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
  it('lists each event once as a row with a channel select', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());

    expect(screen.getAllByText('Scheduled task finished')).toHaveLength(1);

    const scheduleSelect = screen.getByRole('combobox', { name: 'Scheduled task finished' });
    expect(within(scheduleSelect).getByRole('option', { name: 'Off' })).toBeInTheDocument();
    expect(within(scheduleSelect).getByRole('option', { name: 'Email' })).toBeInTheDocument();
    expect(within(scheduleSelect).getByRole('option', { name: 'Mobile push' })).toBeInTheDocument();
    expect(
      within(scheduleSelect).getByRole('option', { name: 'Email, Mobile push' }),
    ).toBeInTheDocument();

    const replySelect = screen.getByRole('combobox', { name: 'Reply ready' });
    expect(within(replySelect).getByRole('option', { name: 'Browser' })).toBeInTheDocument();
    expect(replySelect).toHaveValue('browserReplyReady');
  });

  it('reflects the loaded state as the select value', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());

    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('browserReplyReady');
    expect(screen.getByRole('combobox', { name: 'Scheduled task finished' })).toHaveValue('off');
  });

  it('saves both channel keys when both are selected in one change', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox', { name: 'Scheduled task finished' }), {
      target: { value: 'emailScheduleDone+mobilePushScheduleDone' },
    });

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith('notifications', {
        browserReplyReady: true,
        emailScheduleDone: true,
        mobilePushScheduleDone: true,
      }),
    );
  });

  it('turns an event off by saving false for every one of its channels', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      browserReplyReady: true,
      emailScheduleDone: true,
      mobilePushScheduleDone: true,
    });
    render(<NotificationsSection />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Scheduled task finished' })).toHaveValue(
        'emailScheduleDone+mobilePushScheduleDone',
      ),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Scheduled task finished' }), {
      target: { value: 'off' },
    });

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith('notifications', {
        browserReplyReady: true,
        emailScheduleDone: false,
        mobilePushScheduleDone: false,
      }),
    );
  });
});
