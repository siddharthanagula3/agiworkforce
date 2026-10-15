import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../../utils/navigation', () => ({
  openExternalUrl: vi.fn(async () => undefined),
  openPricingPage: vi.fn(async () => undefined),
}));

import { hasNotificationRoute, openNotificationRoute } from '../notificationRoutes';
import { useNotificationTargetStore } from '../notificationTarget';
import { openExternalUrl } from '../../../utils/navigation';
import { useChatStore } from '../../../stores/chat/chatStore';
import { useSettingsDialogStore } from '../../../stores/settingsDialogStore';
import type { ConversationSummary } from '../../../stores/chat/types';

function conversation(id: string): ConversationSummary {
  return {
    id,
    title: id,
    pinned: false,
    updatedAt: new Date('2026-10-11T00:00:00.000Z'),
    executionMode: 'local_only',
  };
}

function panelNavigations(): unknown[] {
  return vi
    .mocked(window.dispatchEvent)
    .mock.calls.map(([event]) => event)
    .filter((event): event is CustomEvent => event.type === 'desktop:navigate-panel')
    .map((event) => event.detail);
}

beforeAll(async () => {
  await import('@/lib/desktopDeepLinkRouter');
}, 30_000);

beforeEach(() => {
  vi.mocked(window.dispatchEvent).mockClear();
  vi.mocked(openExternalUrl).mockClear();
  useChatStore.setState({
    conversations: [conversation('conversation-1')],
    activeConversationId: null,
  });
  useSettingsDialogStore.setState({ settingsOpen: false, settingsInitialTab: 'general' });
  useNotificationTargetStore.setState({ pending: null });
});

describe('openNotificationRoute', () => {
  it.each([
    ['a fired trigger', 'trigger:trigger-7', 'automation', { kind: 'trigger', id: 'trigger-7' }],
    ['a scheduled run', 'schedule:job-3', 'scheduled', { kind: 'schedule', id: 'job-3' }],
    [
      'a background agent',
      'background-agent:8c1f-agent',
      'agent-tasks',
      { kind: 'background-agent', id: '8c1f-agent' },
    ],
  ])(
    'opens the panel for %s and asks it to select that item',
    async (_what, route, panel, target) => {
      expect(hasNotificationRoute(route)).toBe(true);
      expect(await openNotificationRoute(route)).toBe(true);
      expect(panelNavigations()).toEqual([panel]);
      expect(useNotificationTargetStore.getState().pending).toEqual(target);
    },
  );

  it('keeps an id that contains the separator whole', async () => {
    expect(await openNotificationRoute('schedule:job:with:colons')).toBe(true);
    expect(useNotificationTargetStore.getState().pending).toEqual({
      kind: 'schedule',
      id: 'job:with:colons',
    });
  });

  it('opens the agent tasks panel without selecting anything for a notice about no one agent', async () => {
    expect(await openNotificationRoute('agent-tasks:all')).toBe(true);
    expect(panelNavigations()).toEqual(['agent-tasks']);
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });

  it('opens the chat a notification names', async () => {
    expect(await openNotificationRoute('chat:conversation-1')).toBe(true);
    expect(useChatStore.getState().activeConversationId).toBe('conversation-1');
    expect(panelNavigations()).toEqual(['chat']);
  });

  it('opens the settings tab a notification names', async () => {
    expect(await openNotificationRoute('settings:privacy')).toBe(true);
    expect(useSettingsDialogStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsInitialTab: 'privacy',
    });
  });

  it('stays put for a chat that no longer exists or a tab that never did', async () => {
    expect(await openNotificationRoute('chat:conversation-gone')).toBe(false);
    expect(await openNotificationRoute('settings:not-a-tab')).toBe(false);
    expect(panelNavigations()).toEqual([]);
    expect(useSettingsDialogStore.getState().settingsOpen).toBe(false);
  });

  it.each([
    null,
    undefined,
    '',
    'trigger:',
    ':trigger-7',
    'no-separator',
    'constructor:x',
    'https://example.com/path',
    'javascript:alert(1)',
  ])('does not treat %s as a route, and never leaves the app', async (route) => {
    expect(hasNotificationRoute(route)).toBe(false);
    expect(await openNotificationRoute(route)).toBe(false);
    expect(panelNavigations()).toEqual([]);
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });
});
