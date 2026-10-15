import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NotificationSettings } from '../../stores/notificationStore';
import { NotificationsSettings } from './NotificationsSettings';

const settings: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  badgeEnabled: true,
  desktopNotifications: true,
  enabledTypes: [],
  doNotDisturb: false,
  dndStartTime: null,
  dndEndTime: null,
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
      enabledTypes: expect.not.arrayContaining(['task_failed', 'agent_activity']),
    });
  });
});
