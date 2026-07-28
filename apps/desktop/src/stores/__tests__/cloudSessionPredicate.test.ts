/**
 * One session, one answer.
 *
 * Regression guard for the 2026-07-28 split-brain: the same Managed Cloud
 * session rendered as signed-in (chat greeting, Settings > General "Plan: Max
 * 15x", Settings > Billing) and signed-out (sidebar "Sign in / Cloud sync",
 * Settings > Account, Tasks, Library, Settings > Privacy) at the same time.
 *
 * Cause: five hand-rolled predicates over one store, and only the one the
 * signed-out surfaces used required `user.email`. The desktop bearer is minted
 * by /api/auth/device/token with `email: ''` whenever the browser approval had
 * no email claim (apps/web/lib/server/developer-token.ts), so that predicate
 * was permanently false for a perfectly valid paid session.
 */
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
import { captureManagedCloudBoundary } from '../../services/managedCloudBoundary';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Exactly what stores/authOrchestrator.ts projects (STEP 1 then STEP 5) for a
 * real desktop device bearer: display name from /api/me, email from the JWT
 * claim — which is the empty string.
 */
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

/** True when the managed egress boundary admits the current state. */
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
    expect(state.user?.email).toBe(''); // the shipped token really does look like this
    expect(state.plan).toBe('max_15x');
    expect(selectHasCloudAccountSession(state)).toBe(true);
  });

  it('never disagrees with the managed egress boundary', () => {
    // Egress is the boundary that already worked in the buggy build; a surface
    // that says "Sign in" while managed requests succeed is the split-brain.
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
      plan: 'local-only',
      accessToken: 'leftover-cloud-bearer',
    });

    expect(selectHasCloudAccountSession(useAuthStore.getState())).toBe(false);
  });

  it('derives every cloud-gated surface from selectHasCloudAccountSession', () => {
    // The bug was four extra definitions of "signed in", not a bad value. Any
    // surface that re-derives one from raw store fields can drift again.
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
});
