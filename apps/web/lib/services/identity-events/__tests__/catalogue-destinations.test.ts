import { describe, expect, it } from 'vitest';
import { notificationTargetHref } from '@/features/notifications/lib/notification-target';
import {
  SETTINGS_DEEP_LINK_QUERY_KEY,
  resolveWebSettingsSection,
} from '@/features/settings/lib/web-settings-sections';
import { IDENTITY_SECURITY_EVENT_KEYS, IDENTITY_SECURITY_EVENTS } from '../catalogue';

function openedSection(event: (typeof IDENTITY_SECURITY_EVENT_KEYS)[number]): string | null {
  const href = notificationTargetHref('settings', IDENTITY_SECURITY_EVENTS[event].settingsSection);
  if (href === null) return null;
  const section = new URL(href, 'https://agiworkforce.com').searchParams.get(
    SETTINGS_DEEP_LINK_QUERY_KEY,
  );
  return section === null ? null : resolveWebSettingsSection(section);
}

describe('where an identity notice opens', () => {
  it('gives every notice a link the web resolves to a settings pane', () => {
    const unresolved = IDENTITY_SECURITY_EVENT_KEYS.filter(
      (event) => openedSection(event) === null,
    );
    expect(unresolved).toEqual([]);
  });

  it('sends the deletion notice to its own section, which the web opens on the Account pane', () => {
    expect(IDENTITY_SECURITY_EVENTS.account_deletion_scheduled.settingsSection).toBe(
      'account-deletion',
    );
    expect(notificationTargetHref('settings', 'account-deletion')).toBe(
      `/chat?${SETTINGS_DEEP_LINK_QUERY_KEY}=account-deletion`,
    );
    expect(openedSection('account_deletion_scheduled')).toBe('account');
  });

  it('keeps the device and address notices on the section that lists devices', () => {
    expect(IDENTITY_SECURITY_EVENTS.new_device.settingsSection).toBe('account');
    expect(IDENTITY_SECURITY_EVENTS.email_changed.settingsSection).toBe('account');
    expect(openedSection('new_device')).toBe('account');
  });
});
