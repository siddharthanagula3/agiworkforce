import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { useAppModeStore } from '../appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../auth';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../../services/managedCloudBoundary';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function projectRealDeviceSession(): void {
  const store = useAuthStore.getState();
  store.setUser({ id: 'user_demo', email: '', name: 'demo' });
  store.setAccount({
    id: 'user_demo',
    email: null,
    accessToken: 'device-bearer',
    refreshToken: null,
  });
  store.setAccount({
    id: 'user_demo',
    email: null,
    displayName: 'demo',
    plan: 'max_15x',
    planDisplayName: 'Max 15x',
    subscriptionStatus: 'active',
    subscriptionFetchStatus: 'succeeded',
    accessToken: 'device-bearer',
  });
}

function egressBoundaryAdmits(): boolean {
  try {
    captureManagedCloudBoundary();
    return true;
  } catch {
    return false;
  }
}

describe('desktop cloud session: one predicate for every surface', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAppModeStore.setState({ mode: 'cloud', hasOnboarded: true, hasSelectedMode: true });
  });

  it('treats a device bearer whose email claim is empty as signed in', () => {
    projectRealDeviceSession();

    const state = useAuthStore.getState();
    expect(state.user?.email).toBe('');
    expect(state.plan).toBe('max_15x');
    expect(selectHasCloudAccountSession(state)).toBe(true);
  });

  it('never disagrees with the managed egress boundary', () => {
    const cases: Array<[string, () => void, boolean]> = [
      ['signed out', () => {}, false],
      [
        'identity without a credential',
        () => useAuthStore.getState().setUser({ id: 'user_demo', email: 'demo@example.com' }),
        false,
      ],
      ['real device session', projectRealDeviceSession, true],
      [
        'synthesized local-only account',
        () =>
          useAuthStore.getState().setAccount({
            id: 'local-abc',
            displayName: 'Local User',
            isLocalDeviceAccount: true,
            plan: 'local-only',
            accessToken: null,
          }),
        false,
      ],
    ];

    for (const [label, arrange, expected] of cases) {
      useAuthStore.getState().reset();
      arrange();
      expect(selectHasCloudAccountSession(useAuthStore.getState()), label).toBe(expected);
      expect(egressBoundaryAdmits(), label).toBe(expected);
    }
  });

  it('keeps a Local session out of the Cloud boundary even with a stale token', () => {
    useAuthStore.getState().setAccount({
      id: 'local-abc',
      displayName: 'Local User',
      isLocalDeviceAccount: true,
      plan: 'local-only',
      accessToken: 'leftover-cloud-bearer',
    });

    expect(selectHasCloudAccountSession(useAuthStore.getState())).toBe(false);
    expect(egressBoundaryAdmits()).toBe(false);
  });

  it('keeps the same account boundary valid when its device bearer rotates', () => {
    projectRealDeviceSession();
    const boundary = captureManagedCloudBoundary();
    const sessionEpoch = useAuthStore.getState().cloudSessionEpoch;

    useAuthStore.getState().setAccount({
      id: 'user_demo',
      accessToken: 'rotated-device-bearer',
    });

    expect(useAuthStore.getState().cloudSessionEpoch).toBe(sessionEpoch);
    expect(() => assertManagedCloudBoundary(boundary)).not.toThrow();
  });

  it('invalidates a captured boundary when the signed-in account changes', () => {
    projectRealDeviceSession();
    const boundary = captureManagedCloudBoundary();

    const store = useAuthStore.getState();
    store.setUser({ id: 'user_other', email: 'other@example.com' });
    store.setAccount({
      id: 'user_other',
      accessToken: 'other-device-bearer',
      isLocalDeviceAccount: false,
    });

    expect(() => assertManagedCloudBoundary(boundary)).toThrow(
      'The Managed Cloud account changed while this request was in progress.',
    );
  });

  it('does not revive an old boundary after account A returns through A -> B -> A', () => {
    projectRealDeviceSession();
    const firstAccountBoundary = captureManagedCloudBoundary();

    const store = useAuthStore.getState();
    store.setUser({ id: 'user_other', email: 'other@example.com' });
    store.setAccount({
      id: 'user_other',
      accessToken: 'other-device-bearer',
      isLocalDeviceAccount: false,
    });
    store.setUser({ id: 'user_demo', email: '', name: 'demo' });
    store.setAccount({
      id: 'user_demo',
      accessToken: 'new-device-bearer',
      isLocalDeviceAccount: false,
    });

    expect(useAuthStore.getState().user?.id).toBe(firstAccountBoundary.accountId);
    expect(useAuthStore.getState().cloudSessionEpoch).not.toBe(firstAccountBoundary.sessionEpoch);
    expect(() => assertManagedCloudBoundary(firstAccountBoundary)).toThrow(
      'The Managed Cloud account changed while this request was in progress.',
    );
  });

  it('invalidates an old boundary when the same account signs out and reconnects', () => {
    projectRealDeviceSession();
    const firstSessionBoundary = captureManagedCloudBoundary();

    useAuthStore.getState().clearAuth();
    projectRealDeviceSession();

    expect(useAuthStore.getState().user?.id).toBe(firstSessionBoundary.accountId);
    expect(useAuthStore.getState().cloudSessionEpoch).not.toBe(firstSessionBoundary.sessionEpoch);
    expect(() => assertManagedCloudBoundary(firstSessionBoundary)).toThrow(
      'The Managed Cloud account changed while this request was in progress.',
    );
  });

  it('admits a freshly approved device before its plan tier resolves', () => {
    useAuthStore.getState().setAccount({
      id: 'local-abc',
      displayName: 'Local User',
      isLocalDeviceAccount: true,
      plan: 'local-only',
      accessToken: null,
    });
    expect(selectHasCloudAccountSession(useAuthStore.getState())).toBe(false);

    const store = useAuthStore.getState();
    store.setUser({ id: 'user_demo', email: '', name: 'demo' });
    store.setAccount({
      id: 'user_demo',
      email: null,
      accessToken: 'device-bearer',
      refreshToken: null,
      isLocalDeviceAccount: false,
    });

    const midWindow = useAuthStore.getState();
    expect(midWindow.plan).toBeNull();
    expect(selectHasCloudAccountSession(midWindow)).toBe(true);
    expect(egressBoundaryAdmits()).toBe(true);
  });

  it('derives every cloud-gated surface from selectHasCloudAccountSession', () => {
    const surfaces = [
      'App.tsx',
      'features/v3/Sidebar.tsx',
      'features/tasks/DesktopTasks.tsx',
      'features/library/DesktopLibrary.tsx',
      'features/settings/tabs/Account/index.tsx',
      'features/settings/tabs/Privacy/index.tsx',
      'features/settings/tabs/General/index.tsx',
      'features/settings/BillingSettings.tsx',
      'features/settings/DesktopCloudSettingsModal.tsx',
      'services/managedCloudBoundary.ts',
      'stores/chat/chatStore.ts',
      'stores/projectStore.ts',
      'lib/cloudSyncTrigger.ts',
      'lib/cloudChatPersistence.ts',
    ];

    for (const surface of surfaces) {
      const source = readFileSync(path.join(SRC, surface), 'utf8');
      expect(source, `${surface} must use the shared cloud-session predicate`).toContain(
        'selectHasCloudAccountSession',
      );
      expect(
        /\.isAuthenticated\s*&&|isAuthenticated\s*&&\s*!*\w*\.?accessToken/.test(source),
        `${surface} re-derives its own cloud-session predicate`,
      ).toBe(false);
    }
  });

  it('does not coerce the explicit chat synchronization preference from app mode', () => {
    const appSource = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

    expect(appSource).not.toContain('desiredStorageMode');
    expect(appSource).not.toMatch(/chatPreferences:\s*\{[^}]*chatStorageMode:/s);
  });

  it('scopes the managed runtime lifetime to the authenticated account, not its rotating token', () => {
    const appSource = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

    expect(appSource).toContain(
      "const runtimeAccountId = runtimeAppMode === 'cloud' ? authenticatedUserId : null;",
    );
    expect(appSource).toContain('[runtimeAccountId, runtimeAppMode, runtimeResearchEnabled]');
  });
});
