/**
 * DES-C08 / DES-C21 coverage for the Cloud settings sections.
 *
 * The regressions these guard:
 *   - A bridged section rendering a bare "Open X" button whose child window can
 *     silently land on /login while the app shows the user as signed in.
 *   - Archived chats and shared links being unreachable from Desktop at all.
 *   - The Account section offering no way to see the account id, manage API
 *     keys, or delete the account — and inventing a session list it cannot serve.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openDesktopCloudAccountWindow: vi.fn(),
  listCloudSharedLinks: vi.fn(),
  revokeCloudSharedLink: vi.fn(),
  listCloudArchivedConversations: vi.fn(),
  restoreCloudArchivedConversation: vi.fn(),
  deleteCloudConversation: vi.fn(),
  listCloudApiKeys: vi.fn(),
  createCloudApiKey: vi.fn(),
  revokeCloudApiKey: vi.fn(),
  requestCloudAccountDeletion: vi.fn(),
  hasCloudAccountSession: true,
  accountId: 'user_desktop_1' as string | null,
  signOut: vi.fn(),
}));

vi.mock('../../../services/desktopCloudAccountWindow', () => ({
  openDesktopCloudAccountWindow: mocks.openDesktopCloudAccountWindow,
}));

vi.mock('../../../api/cloudAccountSettings', async () => {
  const actual = await vi.importActual<typeof import('../../../api/cloudAccountSettings')>(
    '../../../api/cloudAccountSettings',
  );
  return {
    CLOUD_API_KEY_SCOPES: actual.CLOUD_API_KEY_SCOPES,
    listCloudSharedLinks: mocks.listCloudSharedLinks,
    revokeCloudSharedLink: mocks.revokeCloudSharedLink,
    listCloudArchivedConversations: mocks.listCloudArchivedConversations,
    restoreCloudArchivedConversation: mocks.restoreCloudArchivedConversation,
    deleteCloudConversation: mocks.deleteCloudConversation,
    listCloudApiKeys: mocks.listCloudApiKeys,
    createCloudApiKey: mocks.createCloudApiKey,
    revokeCloudApiKey: mocks.revokeCloudApiKey,
    requestCloudAccountDeletion: mocks.requestCloudAccountDeletion,
    getCloudTwoFactorStatus: vi.fn(),
    listCloudSecurityActivity: vi.fn(),
  };
});

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: (state: unknown) => state,
  useAuthStore: (selector: (state: unknown) => unknown) => selector(mocks.hasCloudAccountSession),
  useAccountStore: (selector: (state: { account: { id: string | null } }) => unknown) =>
    selector({ account: { id: mocks.accountId } }),
}));

vi.mock('../../../utils/navigation', () => ({
  openExternalUrl: vi.fn(),
}));

import { CloudBridgedSection } from '../cloud/CloudBridgedSection';
import { CloudSharedLinksSection } from '../cloud/CloudSharedLinksSection';
import { CloudArchivedChatsSection } from '../cloud/CloudArchivedChatsSection';
import { CloudAccountControls } from '../tabs/Account/CloudAccountControls';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasCloudAccountSession = true;
  mocks.accountId = 'user_desktop_1';
  mocks.openDesktopCloudAccountWindow.mockResolvedValue(undefined);
  mocks.listCloudSharedLinks.mockResolvedValue([]);
  mocks.listCloudArchivedConversations.mockResolvedValue({
    conversations: [],
    hasMore: false,
    nextOffset: 0,
  });
  mocks.listCloudApiKeys.mockResolvedValue([]);
});

describe('CloudBridgedSection', () => {
  it('states the child window keeps its own web sign-in instead of implying the desktop session carries over', () => {
    render(
      <CloudBridgedSection
        sectionKey="reflect"
        title="Reflect"
        description="Account recap."
        path="/settings/reflect"
        action="Open Reflect"
      />,
    );

    expect(screen.getByTestId('cloud-bridged-reflect')).toBeTruthy();
    expect(screen.getByText(/keeps its own web sign-in/i)).toBeTruthy();
    // The old copy promised a "content-protected child window" — the very thing
    // that made these sections invisible on a shared screen (DES-C09).
    expect(screen.queryByText(/content-protected/i)).toBeNull();
  });

  it('always offers an explicit re-auth route rather than a silent /login landing', async () => {
    const user = userEvent.setup();
    render(
      <CloudBridgedSection
        sectionKey="reflect"
        title="Reflect"
        description="Account recap."
        path="/settings/reflect"
        action="Open Reflect"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sign in again to manage this' }));

    await waitFor(() => expect(mocks.openDesktopCloudAccountWindow).toHaveBeenCalled());
    expect(mocks.openDesktopCloudAccountWindow.mock.calls[0]?.[0]).toBe(
      '/login?redirectTo=%2Fsettings%2Freflect&surface=desktop',
    );
  });

  it('opens the requested settings path for the primary action', async () => {
    const user = userEvent.setup();
    render(
      <CloudBridgedSection
        sectionKey="plugins"
        title="Plugins"
        description="Cloud plugins."
        path="/settings/plugins"
        action="Open Cloud plugins"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Cloud plugins' }));

    await waitFor(() => expect(mocks.openDesktopCloudAccountWindow).toHaveBeenCalled());
    expect(mocks.openDesktopCloudAccountWindow.mock.calls[0]?.[0]).toBe('/settings/plugins');
  });

  it('warns up front when this Desktop has no Cloud session at all', () => {
    mocks.hasCloudAccountSession = false;
    render(
      <CloudBridgedSection
        sectionKey="safety"
        title="Safety"
        description="Safeguards."
        path="/settings/safety"
        action="Open safety controls"
      />,
    );

    expect(screen.getByText(/not connected to AGI Cloud right now/i)).toBeTruthy();
  });

  it('surfaces a window-open failure instead of failing silently', async () => {
    const user = userEvent.setup();
    mocks.openDesktopCloudAccountWindow.mockRejectedValue(new Error('native window failed'));
    render(
      <CloudBridgedSection
        sectionKey="safety"
        title="Safety"
        description="Safeguards."
        path="/settings/safety"
        action="Open safety controls"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open safety controls' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('native window'));
  });
});

describe('CloudSharedLinksSection', () => {
  it('lists the account shared links inline and revokes one', async () => {
    const user = userEvent.setup();
    mocks.listCloudSharedLinks.mockResolvedValue([
      {
        token: 'tok_1',
        title: 'Quarterly plan',
        shareUrl: 'https://agiworkforce.com/share/tok_1',
        messageCount: 4,
        createdAt: '2026-07-01T00:00:00.000Z',
        expiresAt: '2026-08-01T00:00:00.000Z',
        expired: false,
      },
    ]);
    mocks.revokeCloudSharedLink.mockResolvedValue(undefined);

    render(<CloudSharedLinksSection />);

    expect(await screen.findByText('Quarterly plan')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(mocks.revokeCloudSharedLink).toHaveBeenCalledWith('tok_1'));
    await waitFor(() => expect(screen.queryByText('Quarterly plan')).toBeNull());
  });

  it('reports a load failure with a retry rather than an empty list', async () => {
    mocks.listCloudSharedLinks.mockRejectedValue(new Error('HTTP 500'));

    render(<CloudSharedLinksSection />);

    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 500');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('CloudArchivedChatsSection', () => {
  it('restores an archived conversation through the bearer-authed API', async () => {
    const user = userEvent.setup();
    mocks.listCloudArchivedConversations.mockResolvedValue({
      conversations: [{ id: 'conv_1', title: 'Old plan', updatedAt: '2026-06-02T00:00:00.000Z' }],
      hasMore: false,
      nextOffset: 1,
    });
    mocks.restoreCloudArchivedConversation.mockResolvedValue(undefined);

    render(<CloudArchivedChatsSection />);

    expect(await screen.findByText('Old plan')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mocks.restoreCloudArchivedConversation).toHaveBeenCalledWith('conv_1'),
    );
    await waitFor(() => expect(screen.queryByText('Old plan')).toBeNull());
  });
});

describe('CloudAccountControls', () => {
  it('shows the account identifier support asks for', async () => {
    render(<CloudAccountControls />);

    expect(await screen.findByText('user_desktop_1')).toBeTruthy();
  });

  it('states that the account-wide session list cannot be served to a device token', async () => {
    render(<CloudAccountControls />);

    expect(await screen.findByText(/does not accept/i)).toBeTruthy();
    expect(screen.getByTestId('cloud-sign-out-this-device')).toBeTruthy();
    // No fabricated session rows.
    expect(screen.queryByText(/Chrome on macOS/i)).toBeNull();
  });

  it('creates an API key and shows the one-time secret exactly once', async () => {
    const user = userEvent.setup();
    mocks.createCloudApiKey.mockResolvedValue({
      apiKey: {
        id: 'key_1',
        name: 'Laptop CLI',
        keyPrefix: 'sk_live_abc',
        scopes: ['models:read'],
        createdAt: '2026-07-01T00:00:00.000Z',
        lastUsedAt: null,
      },
      fullKey: 'sk_live_abc_secret',
    });

    render(<CloudAccountControls />);

    await user.type(await screen.findByLabelText('New key name'), 'Laptop CLI');
    await user.click(screen.getByRole('button', { name: 'Create API key' }));

    await waitFor(() =>
      expect(mocks.createCloudApiKey).toHaveBeenCalledWith('Laptop CLI', [
        'models:read',
        'inference:write',
      ]),
    );
    expect(await screen.findByText('sk_live_abc_secret')).toBeTruthy();
  });

  it('will not create an API key without a name', async () => {
    render(<CloudAccountControls />);

    const createButton = await screen.findByRole('button', { name: 'Create API key' });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires the typed confirmation before deleting the Cloud account', async () => {
    const user = userEvent.setup();
    mocks.requestCloudAccountDeletion.mockResolvedValue({ message: 'Deletion scheduled' });

    render(<CloudAccountControls />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete my Cloud account' });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Type DELETE to confirm/i), 'DELETE');
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(deleteButton);
    await waitFor(() => expect(mocks.requestCloudAccountDeletion).toHaveBeenCalledOnce());
    expect(await screen.findByText('Deletion scheduled')).toBeTruthy();
  });
});
