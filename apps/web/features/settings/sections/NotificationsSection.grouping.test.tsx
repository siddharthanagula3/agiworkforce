import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';

import { AVAILABLE_NOW_LABEL, SURFACE_STATUS, type SurfaceStatusMap } from '@/lib/surface-status';
import { NotificationsSection } from './NotificationsSection';
import { WEB_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

const MOBILE_RELEASED: SurfaceStatusMap = { ...SURFACE_STATUS, mobile: AVAILABLE_NOW_LABEL };

const mocks = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

type OriginalNotificationsModule = typeof import('@/features/notifications');

vi.mock('@/app/settings/_lib/preferences-client', async (original) => ({
  ...(await original<ImportedModule0>()),
  fetchPreferenceNamespace: mocks.fetchPreferenceNamespace,
  savePreferenceNamespace: mocks.savePreferenceNamespace,
}));

vi.mock('@/features/notifications', async (importOriginal) => ({
  ...(await importOriginal<OriginalNotificationsModule>()),
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
    mobilePushAgentActivity: true,
    newerNotificationPreference: 'preserve',
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

  it('reconciles an unconfirmed write with GET instead of replaying intent', async () => {
    mocks.savePreferenceNamespace.mockRejectedValueOnce(new Error('HTTP 503: Service unavailable'));
    render(<NotificationsSection />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Reply ready' }), {
      target: { value: 'off' },
    });
    await screen.findByText(/Save could not be confirmed/);
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('browserReplyReady');
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Retry saving' })).toBeNull();
    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(2);
    expect(mocks.savePreferenceNamespace.mock.calls).toEqual([
      ['notifications', { browserReplyReady: false }, { merge: true }],
    ]);
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('locks editing until a failed recovery GET is retried without another PUT', async () => {
    mocks.fetchPreferenceNamespace
      .mockResolvedValueOnce({ browserReplyReady: true })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ browserReplyReady: false });
    mocks.savePreferenceNamespace.mockRejectedValueOnce(new Error('lost response'));
    render(<NotificationsSection />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Reply ready' }), {
      target: { value: 'off' },
    });
    const retry = await screen.findByRole('button', { name: 'Retry loading' });
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled(),
    );
    expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue('off');
    expect(mocks.savePreferenceNamespace).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPreferenceNamespace).toHaveBeenCalledTimes(3);
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
    render(<NotificationsSection surfaceStatus={MOBILE_RELEASED} />);
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
    render(<NotificationsSection surfaceStatus={MOBILE_RELEASED} />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    fireEvent.change(screen.getByRole('combobox', { name: 'Scheduled task finished' }), {
      target: { value: 'emailScheduleDone+mobilePushScheduleDone' },
    });

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith(
        'notifications',
        { emailScheduleDone: true, mobilePushScheduleDone: true },
        { merge: true },
      ),
    );
  });

  it('turns an event off by saving false for every one of its channels', async () => {
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      browserReplyReady: true,
      emailScheduleDone: true,
      mobilePushScheduleDone: true,
      mobilePushAgentActivity: true,
      newerNotificationPreference: 'preserve',
    });
    render(<NotificationsSection surfaceStatus={MOBILE_RELEASED} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Scheduled task finished' })).toHaveValue(
        'emailScheduleDone+mobilePushScheduleDone',
      ),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Scheduled task finished' }), {
      target: { value: 'off' },
    });

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith(
        'notifications',
        { emailScheduleDone: false, mobilePushScheduleDone: false },
        { merge: true },
      ),
    );
  });

  it('offers no mobile push while Mobile is unreleased and keeps the stored choice', async () => {
    expect(SURFACE_STATUS.mobile).not.toBe(AVAILABLE_NOW_LABEL);
    mocks.fetchPreferenceNamespace.mockResolvedValue({
      browserReplyReady: true,
      emailScheduleDone: true,
      mobilePushScheduleDone: true,
      mobilePushAgentActivity: true,
      newerNotificationPreference: 'preserve',
    });
    render(<NotificationsSection />);
    const scheduleSelect = screen.getByRole('combobox', { name: 'Scheduled task finished' });
    await waitFor(() => expect(scheduleSelect).toHaveValue('emailScheduleDone'));

    expect(
      within(scheduleSelect)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Off', 'Email']);
    expect(screen.queryByText(/Mobile push/)).toBeNull();

    fireEvent.change(scheduleSelect, { target: { value: 'off' } });

    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith(
        'notifications',
        { emailScheduleDone: false },
        { merge: true },
      ),
    );
  });

  it('offers a Usage push preference that defaults on and saves when turned off', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    const usage = screen.getByRole('combobox', { name: 'Usage' });
    expect(usage).toHaveValue('pushUsageReset');
    fireEvent.change(usage, { target: { value: 'off' } });
    await waitFor(() =>
      expect(mocks.savePreferenceNamespace).toHaveBeenCalledWith(
        'notifications',
        { pushUsageReset: false },
        { merge: true },
      ),
    );
  });

  it('links the scheduled task row to the tasks page', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    expect(screen.getByRole('link', { name: 'Manage tasks' })).toHaveAttribute('href', '/tasks');
  });
});

describe('NotificationsSection search index', () => {
  it('renders a control for every notification the settings search lists', async () => {
    render(<NotificationsSection />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());

    const fields = WEB_SETTINGS_NAV_FIELDS.notifications ?? [];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(screen.getAllByLabelText(field.label).length).toBeGreaterThan(0);
    }
  });
});

const notificationOwner = vi.hoisted(() => ({
  incarnation: 1,
  isCurrent: () => true,
  session: { userId: 'a', sessionId: 'a', isCurrent: () => true, getToken: async () => 'token-a' },
}));
vi.mock('../hooks/use-preference-owner', async (original) => ({
  ...(await original<ImportedModule1>()),
  usePreferenceOwner: () => notificationOwner,
}));
vi.mock('../services/notification-preferences-client', () => ({
  readNotificationPreferences: async () => ({
    stored: await mocks.fetchPreferenceNamespace(),
    version: 'v1',
  }),
  saveNotificationPreferences: async (_authority: unknown, patch: object) => {
    await mocks.savePreferenceNamespace('notifications', patch, { merge: true });
    return { stored: patch, version: 'v2' };
  },
}));

type ImportedModule0 = typeof import('@/app/settings/_lib/preferences-client');
type ImportedModule1 = typeof import('../hooks/use-preference-owner');
