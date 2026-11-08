import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrowserReplyReadyPreference } from '@/features/chat/hooks/use-browser-reply-ready-preference';
import { useCapabilitiesPreferences } from '@/features/settings/hooks/use-capabilities-preferences';
import { invalidatePreferencesSnapshot } from './preferences-client';
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok(body: unknown) {
  return Response.json(body);
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function NotificationsConsumer() {
  const enabled = useBrowserReplyReadyPreference();
  return <output data-testid="notifications">{enabled ? 'enabled' : 'disabled'}</output>;
}

function CapabilitiesConsumer() {
  const { settings } = useCapabilitiesPreferences();
  return <output data-testid="capabilities">{settings.memory ? 'on' : 'off'}</output>;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    ok({
      settings: { notifications: { browserReplyReady: false }, capabilities: { memory: true } },
      organizationMemoryAllowed: true,
    }),
  );
  invalidatePreferencesSnapshot();
});

describe('preferences fan-out collapse', () => {
  it('shares one snapshot across independent consumers alongside the workspace policy read', async () => {
    const { getByTestId } = render(
      <>
        <NotificationsConsumer />
        <CapabilitiesConsumer />
      </>,
    );

    await waitFor(() => expect(getByTestId('notifications').textContent).toBe('disabled'));
    await waitFor(() => expect(getByTestId('capabilities').textContent).toBe('on'));

    expect(requestedUrls().sort()).toEqual(
      [
        MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
        managedCloudPreferencesNamespacePath('capabilities'),
      ].sort(),
    );
  });
});

type SessionSnapshotModule = typeof import('@/lib/identity/useSessionSnapshot');
vi.mock('@/lib/identity/useSessionSnapshot', async (original) => {
  const session = {
    userId: 'preferences-owner',
    sessionId: 'preferences-session',
    isCurrent: () => true,
    getToken: async () => 'preferences-token',
  };
  return { ...(await original<SessionSnapshotModule>()), useSessionSnapshot: () => () => session };
});

type WorkspacesModule = typeof import('@/features/workspaces/hooks/use-workspaces');
vi.mock('@/features/workspaces/hooks/use-workspaces', async (original) => {
  const { useSessionSnapshot } = await import('@/lib/identity/useSessionSnapshot');
  const { observeWorkspaceOwner, admitWorkspace } =
    await import('@/features/workspaces/lib/workspace-admission');
  const data = {
    accountId: 'preferences-account',
    workspaces: [],
    activeWorkspaceId: null,
    activeOrganizationId: null,
    scope: 'personal',
  };
  return {
    ...(await original<WorkspacesModule>()),
    useAccountWorkspaces: () => {
      const owner = observeWorkspaceOwner(useSessionSnapshot()());
      if (owner?.phase === 'resolving')
        admitWorkspace(
          owner,
          owner.epoch,
          JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]),
        );
      return {
        data,
        isLoading: false,
        isError: false,
        requiresReload: owner?.phase === 'uncertain',
        refetch: vi.fn(),
      };
    },
  };
});
