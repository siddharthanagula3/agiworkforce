import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: preferences.load,
  savePreferenceNamespace: preferences.save,
}));

import { NotificationsSection } from './NotificationsSection';

const requestPermission = vi.fn();
const register = vi.fn();
const subscribe = vi.fn();
const network = vi.fn();
const getSubscription = vi.fn();

function browser(permission: NotificationPermission | null, withPush = true) {
  vi.stubGlobal(
    'Notification',
    permission === null ? undefined : { permission, requestPermission },
  );
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal(
    'navigator',
    withPush
      ? {
          serviceWorker: {
            register,
            getRegistration: vi
              .fn()
              .mockResolvedValue({ pushManager: { getSubscription, subscribe } }),
          },
        }
      : {},
  );
  vi.stubGlobal('fetch', network);
}

beforeEach(() => {
  preferences.load.mockResolvedValue({
    browserReplyReady: true,
    pushUsageReset: true,
    emailScheduleDone: true,
    emailSecurityAlerts: true,
  });
  preferences.save.mockReset();
  requestPermission.mockReset();
  register.mockReset();
  subscribe.mockReset();
  network.mockReset();
  getSubscription.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('saved notification preferences and browser capability', () => {
  it.each([
    ['denied', 'Blocked'],
    ['default', 'Not allowed yet'],
    ['granted', 'Allowed'],
    [null, 'Unavailable'],
  ] as const)(
    'explains %s without changing desired channels or asking for permission',
    async (permission, label) => {
      browser(permission);
      render(<NotificationsSection />);
      const notice = screen.getByRole('note', { name: 'Browser delivery status' });
      await waitFor(() => expect(notice).toHaveTextContent(`Browser delivery: ${label}`));
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Reply ready' })).toBeEnabled(),
      );
      for (const heading of ['Reply ready', 'Usage'])
        expect(
          screen
            .getByRole('combobox', { name: heading })
            .getAttribute('aria-describedby')
            ?.split(/\s+/),
        ).toContain(notice.id);
      expect(
        screen
          .getByRole('switch', { name: 'Agent run updates' })
          .getAttribute('aria-describedby')
          ?.split(/\s+/),
      ).toContain(notice.id);
      expect(
        screen
          .getByRole('combobox', { name: 'Security alerts' })
          .getAttribute('aria-describedby')
          ?.split(/\s+/),
      ).not.toContain(notice.id);
      expect(
        screen
          .getByRole('combobox', { name: 'Scheduled task finished' })
          .getAttribute('aria-describedby')
          ?.split(/\s+/),
      ).not.toContain(notice.id);
      expect(screen.getByRole('combobox', { name: 'Reply ready' })).toHaveValue(
        'browserReplyReady',
      );
      expect(screen.getByRole('combobox', { name: 'Usage' })).toHaveValue('pushUsageReset');
      expect(screen.getByRole('combobox', { name: 'Security alerts' })).toHaveValue(
        'emailSecurityAlerts',
      );
      expect(notice).toHaveTextContent('email and mobile delivery are separate');
      expect(preferences.save).not.toHaveBeenCalled();
      expect(requestPermission).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it('distinguishes popup permission from unavailable browser push', async () => {
    browser('granted', false);
    render(<NotificationsSection />);
    const notice = screen.getByRole('note', { name: 'Browser delivery status' });
    await waitFor(() =>
      expect(notice).toHaveTextContent('Reply ready can still use browser popups'),
    );
    expect(screen.getByRole('switch', { name: 'Agent run updates' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Usage' })).not.toBeDisabled();
  });

  it('keeps an existing browser registration selected when permission is blocked', async () => {
    getSubscription.mockResolvedValue({ endpoint: 'https://push.example.test/existing' });
    browser('denied');
    render(<NotificationsSection />);
    const toggle = screen.getByRole('switch', { name: 'Agent run updates' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(toggle).toBeDisabled();
    expect(screen.getByRole('note', { name: 'Browser delivery status' })).toHaveTextContent(
      'Blocked',
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('refreshes permission presentation on focus without saving channels', async () => {
    browser('denied');
    render(<NotificationsSection />);
    const notice = screen.getByRole('note', { name: 'Browser delivery status' });
    await waitFor(() => expect(notice).toHaveTextContent('Blocked'));
    browser('granted');
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(notice).toHaveTextContent('Allowed'));
    expect(preferences.save).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('keeps essential security and task-delivery detail reachable', async () => {
    browser('default');
    render(<NotificationsSection />);
    const security = screen.getByRole('region', { name: 'Security alerts' });
    await userEvent.click(within(security).getByText('Delivery details'));
    expect(within(security).getByText(/Advanced Account Security requires it/)).toBeVisible();
    expect(security).toHaveTextContent('including quiet hours');
    const tasks = screen.getByRole('region', { name: 'Scheduled task finished' });
    await userEvent.click(within(tasks).getByText('Delivery details'));
    expect(within(tasks).getByText(/Runs continue on the server/)).toBeVisible();
    expect(within(tasks).getByRole('link', { name: 'Manage tasks' })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });
});
