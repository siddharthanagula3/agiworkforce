import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

import { desktopDeepLink } from '../tauri-electron/bridgeContract';
import { routeDesktopDeepLink, subscribeDesktopDeepLinkEvents } from '../desktopDeepLinkRouter';
import { useChatStore } from '../../stores/chat/chatStore';
import { useProjectStore, type Project } from '../../stores/projectStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import type { ConversationSummary } from '../../stores/chat/types';

function conversation(id: string): ConversationSummary {
  return {
    id,
    title: id,
    pinned: false,
    updatedAt: new Date('2026-09-16T00:00:00.000Z'),
    executionMode: 'local_only',
  };
}

function project(id: string): Project {
  return {
    id,
    name: id,
    description: '',
    customInstructions: '',
    files: [],
    conversationIds: [],
    conversationCount: 0,
    isArchived: false,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  };
}

function panelNavigations(): unknown[] {
  return vi
    .mocked(window.dispatchEvent)
    .mock.calls.map(([event]) => event)
    .filter((event): event is CustomEvent => event.type === 'desktop:navigate-panel')
    .map((event) => event.detail);
}

beforeEach(() => {
  vi.mocked(window.dispatchEvent).mockClear();
  useChatStore.setState({
    conversations: [conversation('conversation-1')],
    activeConversationId: null,
  });
  useProjectStore.setState({ projects: [project('project-1')], activeProjectId: null });
  useSettingsDialogStore.setState({ settingsOpen: false, settingsInitialTab: 'general' });
});

describe('routeDesktopDeepLink', () => {
  it('opens the conversation a chat link names', () => {
    expect(routeDesktopDeepLink(desktopDeepLink('chat', 'conversation-1'))).toBe(true);
    expect(useChatStore.getState().activeConversationId).toBe('conversation-1');
    expect(panelNavigations()).toContain('chat');
  });

  it('opens the project a project link names', () => {
    expect(routeDesktopDeepLink(desktopDeepLink('project', 'project-1'))).toBe(true);
    expect(useProjectStore.getState().activeProjectId).toBe('project-1');
    expect(panelNavigations()).toContain('projects');
  });

  it('opens settings on the tab a settings link names', () => {
    expect(routeDesktopDeepLink(desktopDeepLink('settings', 'connectors'))).toBe(true);
    expect(useSettingsDialogStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsInitialTab: 'connectors',
    });
  });

  it('changes nothing for a chat link naming a conversation that is not there', () => {
    expect(routeDesktopDeepLink(desktopDeepLink('chat', 'conversation-missing'))).toBe(false);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(panelNavigations()).toHaveLength(0);
  });

  it('changes nothing for a project link naming a project that is not there', () => {
    expect(routeDesktopDeepLink(desktopDeepLink('project', 'project-missing'))).toBe(false);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(panelNavigations()).toHaveLength(0);
  });

  it('changes nothing for a settings link naming no known tab', () => {
    expect(routeDesktopDeepLink('agiworkforce-cloud://settings/not-a-tab')).toBe(false);
    expect(useSettingsDialogStore.getState().settingsOpen).toBe(false);
  });

  it('changes nothing for an unknown target', () => {
    expect(routeDesktopDeepLink('agiworkforce-cloud://invoice/inv-1')).toBe(false);
    expect(panelNavigations()).toHaveLength(0);
  });

  it('changes nothing for an unparseable link', () => {
    expect(routeDesktopDeepLink('not a url')).toBe(false);
    expect(routeDesktopDeepLink('agiworkforce-cloud://chat/')).toBe(false);
    expect(routeDesktopDeepLink('https://example.com/chat/conversation-1')).toBe(false);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(panelNavigations()).toHaveLength(0);
  });
});

describe('subscribeDesktopDeepLinkEvents', () => {
  it('routes a link arriving on the agi-deep-link event, and stops on unsubscribe', () => {
    const unsubscribe = subscribeDesktopDeepLinkEvents();

    window.dispatchEvent(
      new CustomEvent('agi-deep-link', {
        detail: { url: desktopDeepLink('chat', 'conversation-1') },
      }),
    );
    expect(useChatStore.getState().activeConversationId).toBe('conversation-1');

    unsubscribe();
    useChatStore.setState({ activeConversationId: null });
    window.dispatchEvent(
      new CustomEvent('agi-deep-link', {
        detail: { url: desktopDeepLink('chat', 'conversation-1') },
      }),
    );
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it('ignores an event whose detail carries no url', () => {
    const unsubscribe = subscribeDesktopDeepLinkEvents();
    window.dispatchEvent(new CustomEvent('agi-deep-link', { detail: { provider: 'github' } }));
    expect(useChatStore.getState().activeConversationId).toBeNull();
    unsubscribe();
  });
});
