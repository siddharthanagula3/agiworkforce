/**
 * DES-C08: every Cloud settings section that has a bearer-reachable contract
 * must render INLINE from the account, not in a webview gated on a Clerk
 * browser cookie Desktop never holds — that window could land on `/login`
 * while the app still showed the user as signed in.
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
  getCloudAccountProfile: vi.fn(),
  getCloudPreferenceNamespace: vi.fn(),
  saveCloudPreferenceNamespace: vi.fn(),
  saveCloudDisplayName: vi.fn(),
  fetchCloudReflectRecap: vi.fn(),
  getCloudOrganizationOverview: vi.fn(),
  listCloudTeamMembers: vi.fn(),
}));

// Only the shell is replaced (so the section map can be captured); every other
// export stays real. Returning a two-key module instead made every other
// `@agiworkforce/ui` component undefined for the lazily-loaded tabs this modal
// mounts, which surfaced as "Element type is invalid" once a lazy chunk had
// been resolved by an earlier test in the file.
vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/ui')>('@agiworkforce/ui');
  return { ...actual, SettingsModal: mocks.settingsModal };
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
    getCloudAccountProfile: mocks.getCloudAccountProfile,
    getCloudPreferenceNamespace: mocks.getCloudPreferenceNamespace,
    saveCloudPreferenceNamespace: mocks.saveCloudPreferenceNamespace,
    saveCloudDisplayName: mocks.saveCloudDisplayName,
    fetchCloudReflectRecap: mocks.fetchCloudReflectRecap,
    getCloudOrganizationOverview: mocks.getCloudOrganizationOverview,
    listCloudTeamMembers: mocks.listCloudTeamMembers,
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
  mocks.getCloudAccountProfile.mockResolvedValue({
    email: 'founder@example.com',
    displayName: 'Founder Example',
    preferredName: null,
    workDescription: null,
  });
  mocks.getCloudPreferenceNamespace.mockResolvedValue({});
  mocks.saveCloudPreferenceNamespace.mockResolvedValue(undefined);
  mocks.saveCloudDisplayName.mockResolvedValue(undefined);
  mocks.fetchCloudReflectRecap.mockResolvedValue({
    range: '30d',
    generatedAt: '2026-08-01T00:00:00.000Z',
    period: { start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z', label: 'July' },
    summary: { headline: 'A quiet month', body: 'No conversations yet.' },
    stats: { totalConversations: 0, activeDays: 0, mostActiveDay: null, peakHour: null },
    dailyActivity: [],
    topics: [],
    insights: [],
    sampled: false,
    sampledConversationCount: 0,
  });
  mocks.getCloudOrganizationOverview.mockResolvedValue({
    organization: null,
    canManageTeam: false,
  });
  mocks.listCloudTeamMembers.mockResolvedValue([]);
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
    ['general', 'cloud-profile'],
    ['safety', 'cloud-safety'],
    ['notifications', 'cloud-notifications'],
    ['reflect', 'cloud-reflect'],
    ['time-focus', 'cloud-time-focus'],
    ['plugins', 'cloud-plugins'],
    ['team', 'cloud-team'],
  ])('section %s renders inline instead of opening a web child window', async (key, testId) => {
    renderSection(key);

    await waitFor(() => expect(screen.getByTestId(testId)).toBeTruthy());
    // The bridged window is the thing being removed: no section may still offer
    // the re-auth escape hatch, because none of them opens a cookie-gated page.
    expect(screen.queryByRole('button', { name: 'Sign in again to manage this' })).toBeNull();
  });

  it.each([
    ['general', mocks.getCloudAccountProfile],
    ['safety', mocks.getCloudPreferenceNamespace],
    ['notifications', mocks.getCloudPreferenceNamespace],
    ['reflect', mocks.fetchCloudReflectRecap],
    ['time-focus', mocks.getCloudPreferenceNamespace],
    ['team', mocks.getCloudOrganizationOverview],
  ])('section %s reads real account data through the device bearer', async (key, reader) => {
    renderSection(key);

    await waitFor(() => expect(reader).toHaveBeenCalled());
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
