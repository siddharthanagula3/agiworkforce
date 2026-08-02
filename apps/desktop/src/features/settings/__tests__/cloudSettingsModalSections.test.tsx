/**
 * DES-C08: the sections that CAN be served to Desktop's device bearer must
 * render inline, and the ones that cannot must render the explicit re-auth
 * state — never a bare "Open X" whose child window can land on /login while the
 * app still shows the user as signed in.
 *
 * This drives the real modal (its nav comes from SETTINGS_NAV_GROUPS_WEB) and
 * mounts the section content it produces, so a section quietly regressing back
 * to a bridged window fails here.
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsModal } from '@agiworkforce/ui';

const mocks = vi.hoisted(() => ({
  settingsModal: vi.fn((_props: unknown) => null),
  listConnectors: vi.fn(),
  connectConnector: vi.fn(),
  createCustomConnector: vi.fn(),
  deleteCustomConnector: vi.fn(),
  disconnectConnector: vi.fn(),
  listCloudSkills: vi.fn(),
  listCloudSharedLinks: vi.fn(),
  listCloudArchivedConversations: vi.fn(),
  getCloudTwoFactorStatus: vi.fn(),
  listCloudSecurityActivity: vi.fn(),
}));

vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/ui')>('@agiworkforce/ui');
  return {
    SettingsModal: mocks.settingsModal,
    SETTINGS_NAV_GROUPS_WEB: actual.SETTINGS_NAV_GROUPS_WEB,
  };
});

vi.mock('../../../api/cloudConnectors', () => ({
  listConnectors: mocks.listConnectors,
  connectConnector: mocks.connectConnector,
  createCustomConnector: mocks.createCustomConnector,
  deleteCustomConnector: mocks.deleteCustomConnector,
  disconnectConnector: mocks.disconnectConnector,
}));

vi.mock('../../../api/cloudSkills', () => ({
  listCloudSkills: mocks.listCloudSkills,
}));

vi.mock('../../../api/cloudAccountSettings', async () => {
  const actual = await vi.importActual<typeof import('../../../api/cloudAccountSettings')>(
    '../../../api/cloudAccountSettings',
  );
  return {
    ...actual,
    listCloudSharedLinks: mocks.listCloudSharedLinks,
    listCloudArchivedConversations: mocks.listCloudArchivedConversations,
    getCloudTwoFactorStatus: mocks.getCloudTwoFactorStatus,
    listCloudSecurityActivity: mocks.listCloudSecurityActivity,
  };
});

import { DesktopCloudSettingsModal } from '../DesktopCloudSettingsModal';

type CapturedSettingsProps = ComponentProps<typeof SettingsModal>;

function sectionContent(): CapturedSettingsProps['sectionContent'] {
  const props = mocks.settingsModal.mock.calls.at(-1)?.[0] as CapturedSettingsProps | undefined;
  if (!props) throw new Error('DesktopCloudSettingsModal did not render the shared SettingsModal.');
  return props.sectionContent;
}

function renderSection(key: string) {
  render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);
  const content = sectionContent()[key];
  expect(content).toBeTruthy();
  return render(<>{content}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listConnectors.mockResolvedValue({ connectors: [], available: [] });
  mocks.listCloudSkills.mockResolvedValue([]);
  mocks.listCloudSharedLinks.mockResolvedValue([]);
  mocks.listCloudArchivedConversations.mockResolvedValue({
    conversations: [],
    hasMore: false,
    nextOffset: 0,
  });
  mocks.getCloudTwoFactorStatus.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
  mocks.listCloudSecurityActivity.mockResolvedValue([]);
});

describe('DesktopCloudSettingsModal section wiring', () => {
  it('renders shared links inline from the Cloud account, not in a child window', async () => {
    renderSection('shared-links');

    await waitFor(() => expect(screen.getByTestId('cloud-shared-links')).toBeTruthy());
    expect(mocks.listCloudSharedLinks).toHaveBeenCalled();
  });

  it('renders archived chats inline from the Cloud account', async () => {
    renderSection('archived');

    await waitFor(() => expect(screen.getByTestId('cloud-archived-chats')).toBeTruthy());
    expect(mocks.listCloudArchivedConversations).toHaveBeenCalled();
  });

  it('renders the security posture inline and keeps only credential enrollment bridged', async () => {
    renderSection('security');

    await waitFor(() => expect(screen.getByTestId('cloud-security')).toBeTruthy());
    expect(mocks.getCloudTwoFactorStatus).toHaveBeenCalled();
    expect(screen.getByTestId('cloud-bridged-security-credentials')).toBeTruthy();
  });

  it.each([
    ['general', 'cloud-bridged-general'],
    ['safety', 'cloud-bridged-safety'],
    ['notifications', 'cloud-bridged-notifications'],
    ['reflect', 'cloud-bridged-reflect'],
    ['time-focus', 'cloud-bridged-time-focus'],
    ['plugins', 'cloud-bridged-plugins'],
  ])('section %s offers an explicit re-auth route', async (key, testId) => {
    renderSection(key);

    await waitFor(() => expect(screen.getByTestId(testId)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Sign in again to manage this' }).length).toBe(1);
  });

  it('no longer claims any settings surface is content-protected', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);
    const content = sectionContent();

    for (const key of ['general', 'safety', 'notifications', 'reflect', 'time-focus', 'plugins']) {
      const { unmount } = render(<>{content[key]}</>);
      expect(screen.queryByText(/content-protected/i)).toBeNull();
      unmount();
    }
  });
});
