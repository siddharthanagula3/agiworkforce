import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';

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
  useWebPushToggle: () => ({
    checked: false,
    disabled: false,
    description: 'Get told when a run finishes, fails, or needs your approval.',
    unavailable: false,
    onCheckedChange: vi.fn(),
  }),
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
  it('waits for the saved preferences before allowing changes', () => {
    mocks.fetchPreferenceNamespace.mockReturnValue(new Promise(() => {}));
    render(<NotificationsSection />);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeDisabled();
  });

  it('submits once and locks channels until the write settles, including strict rendering', async () => {
    mocks.savePreferenceNamespace.mockReturnValue(new Promise(() => {}));
    render(
      <StrictMode>
        <NotificationsSection />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    fireEvent.change(screen.getByRole('combobox', { name: 'Reply ready' }), {
      target: { value: 'off' },
    });
    expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Scheduled task finished' })).toBeDisabled();
  });

  it('restores the saved choice after a failed write and retries the intended change', async () => {
    mocks.savePreferenceNamespace.mockRejectedValueOnce(new Error('HTTP 503: Service unavailable'));
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    fireEvent.change(screen.getByRole('combobox', { name: 'Reply ready' }), {
      target: { value: 'off' },
    });
    const retry = await screen.findByRole('button', { name: 'Retry saving' });
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('browserReplyReady');
    const failure = screen.getByRole('alert');
    expect(failure).toHaveTextContent('Changes were not saved');
    expect(failure.textContent).not.toContain('HTTP');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('off');
    expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(2);
  });

  it('keeps channels locked after a failed read and offers a load retry', async () => {
    mocks.fetchPreferenceNamespace.mockRejectedValueOnce(new Error('offline'));
    render(<NotificationsSection />);
    const retry = await screen.findByRole('button', { name: 'Retry loading' });
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled(),
    );
    expect(mocks.savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('lists each event once as a row with a channel select', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

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
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('browserReplyReady');
    expect(screen.getByRole('combobox', { name: 'Scheduled task finished' })).toHaveValue('off');
  });

  it('saves both channel keys when both are selected in one change', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

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
