import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NotificationSettings } from '../../hooks/useNotifications';
import { NotificationsSettings } from './NotificationsSettings';

const settings: NotificationSettings = {
  enabled: true,
  sound_enabled: true,
  badge_enabled: true,
  desktop_notifications: true,
  enabled_types: [],
  do_not_disturb: false,
  dnd_start_time: null,
  dnd_end_time: null,
};

describe('NotificationsSettings', () => {
  afterEach(() => {
    cleanup();
  });

  it('exposes the native notification type filters and master controls', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    render(
      <NotificationsSettings
        notificationLoading={false}
        notificationSettings={settings}
        notificationError={null}
        onUpdateNotificationSettings={onUpdate}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Task completions' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Failures and input needed' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Permission and system alerts' })).toBeChecked();

    await user.click(screen.getByRole('switch', { name: 'Failures and input needed' }));
    expect(onUpdate).toHaveBeenCalledWith({
      enabled_types: expect.not.arrayContaining(['task_failed', 'agent_activity']),
    });
  });
});
