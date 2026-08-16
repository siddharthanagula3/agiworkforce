import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privacyMode: 'local' as 'local' | 'byok' | 'managed',
  collapsed: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../stores/chat', () => ({
  selectSidebarCollapsed: () => mocks.collapsed,
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      conversations: [],
      activeConversationId: null,
      renameConversation: vi.fn(),
      deleteConversation: vi.fn(),
      togglePinnedConversation: vi.fn(),
      archiveConversation: vi.fn(),
      restoreConversation: vi.fn(),
    }),
  useSidecarStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ sidebarCollapsed: mocks.collapsed, setSidebarCollapsed: vi.fn() }),
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      projects: [],
      activeProjectId: null,
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      archiveProject: vi.fn(),
      setActiveProject: vi.fn(),
      moveConversationToProject: vi.fn(),
    }),
}));

vi.mock('../../../stores/auth', () => ({
  selectUser: () => null,
  selectPlanDisplayName: () => 'Plan',
  selectHasCloudAccountSession: () => false,
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ cloudSessionEpoch: 1 }),
}));

vi.mock('../../../stores/settingsDialogStore', () => ({
  useSettingsDialogStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openSettings: vi.fn() }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectPrivacyMode: () => mocks.privacyMode,
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ mode: 'local', setMode: vi.fn() }),
}));

vi.mock('../../../stores/cloudTaskBadgeStore', () => {
  const useCloudTaskBadgeStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ needsUserCount: 0 });
  useCloudTaskBadgeStore.getState = () => ({ refresh: vi.fn(), reset: vi.fn() });
  return { useCloudTaskBadgeStore };
});

vi.mock('../LocalCloudToggle', () => ({ LocalCloudToggle: () => null }));
vi.mock('../../updates', () => ({ UpdatePill: () => null }));
vi.mock('../AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  AgiMark: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { Sidebar } from '../Sidebar';

function navIds(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-nav-id'))
    .filter((id): id is string => id !== null);
}

function renderNavIds(privacyMode: 'local' | 'managed', collapsed: boolean): string[] {
  mocks.privacyMode = privacyMode;
  mocks.collapsed = collapsed;
  render(<Sidebar mode="chat" />);
  const ids = navIds();
  cleanup();
  return ids;
}

describe('collapsed rail keeps every expanded nav destination', () => {
  beforeEach(() => {
    mocks.privacyMode = 'local';
    mocks.collapsed = false;
  });

  afterEach(() => cleanup());

  it.each(['local', 'managed'] as const)('holds in %s mode', (privacyMode) => {
    const expanded = renderNavIds(privacyMode, false);
    const rail = renderNavIds(privacyMode, true);

    expect(expanded.length).toBeGreaterThan(0);
    expect(rail.length).toBeGreaterThan(0);

    const missingFromRail = expanded.filter((id) => !rail.includes(id));
    expect(missingFromRail).toEqual([]);
  });

  it('offers Scheduled from the Local rail, not only the expanded nav', () => {
    expect(renderNavIds('local', true)).toContain('scheduled');
  });

  it.each(['design', 'research', 'automation'] as const)(
    'keeps %s on the Local nav and off the managed nav in both layouts',
    (navId) => {
      expect(renderNavIds('local', false)).toContain(navId);
      expect(renderNavIds('local', true)).toContain(navId);
      expect(renderNavIds('managed', false)).not.toContain(navId);
      expect(renderNavIds('managed', true)).not.toContain(navId);
    },
  );

  it('keeps Code off the managed nav in both layouts', () => {
    expect(renderNavIds('managed', false)).not.toContain('code');
    expect(renderNavIds('managed', true)).not.toContain('code');
    expect(renderNavIds('local', false)).toContain('code');
    expect(renderNavIds('local', true)).toContain('code');
  });

  it.each(['local', 'managed'] as const)(
    'routes the Customize nav to a real destination in %s mode',
    (privacyMode) => {
      mocks.privacyMode = privacyMode;
      mocks.collapsed = false;
      const onNavigateView = vi.fn();
      const { container } = render(<Sidebar mode="chat" onNavigateView={onNavigateView} />);
      const customize = container.querySelector('[data-nav-id="customize"]');
      expect(customize).not.toBeNull();
      fireEvent.click(customize as Element);
      expect(onNavigateView).toHaveBeenCalledWith('settings');
    },
  );
});
