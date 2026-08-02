/**
 * The six Cloud settings sections that used to open a Clerk-cookie-gated child
 * window (profile, safety, notifications, Reflect, time and focus, plugins) plus
 * team, now that each renders from the account through the device bearer.
 *
 * The regressions these guard:
 *   - A section quietly going back to a bridged window that can land on /login.
 *   - A save silently deleting the sibling keys of a preferences namespace
 *     (PUT /api/settings/preferences replaces a namespace wholesale).
 *   - An optimistic toggle staying flipped after the save failed.
 *   - Admin controls being offered on the client's own guess instead of the
 *     server's `access.canManageTeam` verdict.
 *   - Reflect showing an error when the honest answer is "memory is off".
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCloudAccountProfile: vi.fn(),
  saveCloudDisplayName: vi.fn(),
  getCloudPreferenceNamespace: vi.fn(),
  saveCloudPreferenceNamespace: vi.fn(),
  fetchCloudReflectRecap: vi.fn(),
  getCloudOrganizationOverview: vi.fn(),
  listCloudTeamMembers: vi.fn(),
  updateCloudTeamMemberRole: vi.fn(),
  removeCloudTeamMember: vi.fn(),
  addCloudTeamMember: vi.fn(),
  openExternalUrl: vi.fn(),
}));

vi.mock('../../../api/cloudAccountSettings', async () => {
  const actual = await vi.importActual<typeof import('../../../api/cloudAccountSettings')>(
    '../../../api/cloudAccountSettings',
  );
  return {
    ...actual,
    getCloudAccountProfile: mocks.getCloudAccountProfile,
    saveCloudDisplayName: mocks.saveCloudDisplayName,
    getCloudPreferenceNamespace: mocks.getCloudPreferenceNamespace,
    saveCloudPreferenceNamespace: mocks.saveCloudPreferenceNamespace,
    fetchCloudReflectRecap: mocks.fetchCloudReflectRecap,
    getCloudOrganizationOverview: mocks.getCloudOrganizationOverview,
    listCloudTeamMembers: mocks.listCloudTeamMembers,
    updateCloudTeamMemberRole: mocks.updateCloudTeamMemberRole,
    removeCloudTeamMember: mocks.removeCloudTeamMember,
    addCloudTeamMember: mocks.addCloudTeamMember,
  };
});

vi.mock('../../../utils/navigation', () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

import { CloudReflectMemoryRequiredError } from '../../../api/cloudAccountSettings';
import { CloudNotificationsSection } from '../cloud/CloudNotificationsSection';
import { CloudPluginsSection } from '../cloud/CloudPluginsSection';
import { CloudProfileSection } from '../cloud/CloudProfileSection';
import { CloudReflectSection } from '../cloud/CloudReflectSection';
import { CloudSafetySection } from '../cloud/CloudSafetySection';
import { CloudTeamSection } from '../cloud/CloudTeamSection';
import { CloudTimeFocusSection } from '../cloud/CloudTimeFocusSection';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCloudPreferenceNamespace.mockResolvedValue({});
  mocks.saveCloudPreferenceNamespace.mockResolvedValue(undefined);
  mocks.saveCloudDisplayName.mockResolvedValue(undefined);
  mocks.getCloudAccountProfile.mockResolvedValue({
    email: 'founder@example.com',
    displayName: 'Founder Example',
    preferredName: null,
    workDescription: null,
  });
  mocks.openExternalUrl.mockResolvedValue(undefined);
});

describe('CloudProfileSection', () => {
  it('applies web precedence: a stored empty string never beats the resolved profile', async () => {
    mocks.getCloudAccountProfile.mockResolvedValue({
      email: 'founder@example.com',
      displayName: 'Founder Example',
      preferredName: 'Sid',
      workDescription: 'Software engineering',
    });
    mocks.getCloudPreferenceNamespace.mockResolvedValue({
      preferredName: '   ',
      workDescription: '',
      instructions: 'Be concise.',
    });

    render(<CloudProfileSection />);

    const preferred = (await screen.findByLabelText(
      'What should AGI call you?',
    )) as HTMLInputElement;
    expect(preferred.value).toBe('Sid');
    expect((screen.getByLabelText('Instructions for AGI') as HTMLTextAreaElement).value).toBe(
      'Be concise.',
    );
    expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Founder Example');
  });

  it('writes the whole namespace back so sibling keys survive the save', async () => {
    const user = userEvent.setup();
    mocks.getCloudPreferenceNamespace.mockResolvedValue({
      chatFont: 'serif',
      voice: 'nova',
      preferredName: 'Sid',
    });

    render(<CloudProfileSection />);
    await screen.findByLabelText('Full name');

    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(mocks.saveCloudDisplayName).toHaveBeenCalledWith('Founder Example'));
    expect(mocks.saveCloudPreferenceNamespace).toHaveBeenCalledWith('general', {
      chatFont: 'serif',
      voice: 'nova',
      preferredName: 'Sid',
      workDescription: '',
      instructions: '',
    });
  });

  it('reports a save failure instead of claiming the account is synced', async () => {
    const user = userEvent.setup();
    mocks.saveCloudDisplayName.mockRejectedValue(new Error('HTTP 500'));

    render(<CloudProfileSection />);
    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 500'));
    expect(screen.queryByText('Synced to your account.')).toBeNull();
  });
});

describe('CloudSafetySection', () => {
  it('reads and writes the account safety namespace', async () => {
    const user = userEvent.setup();
    mocks.getCloudPreferenceNamespace.mockResolvedValue({ reduceSensitiveContent: false });

    render(<CloudSafetySection />);

    const toggle = (await screen.findByLabelText('Reduce sensitive content')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    await user.click(toggle);

    await waitFor(() =>
      expect(mocks.saveCloudPreferenceNamespace).toHaveBeenCalledWith('safety', {
        reduceSensitiveContent: true,
      }),
    );
    expect(toggle.checked).toBe(true);
  });

  it('reverts the toggle when the account write fails', async () => {
    const user = userEvent.setup();
    mocks.saveCloudPreferenceNamespace.mockRejectedValue(new Error('HTTP 503'));

    render(<CloudSafetySection />);
    const toggle = (await screen.findByLabelText('Reduce sensitive content')) as HTMLInputElement;
    await user.click(toggle);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 503'));
    expect(toggle.checked).toBe(false);
  });
});

describe('CloudNotificationsSection', () => {
  it('defaults reply-ready on when the account has never stored the preference', async () => {
    mocks.getCloudPreferenceNamespace.mockResolvedValue({});

    render(<CloudNotificationsSection />);

    expect(((await screen.findByLabelText('Reply ready')) as HTMLInputElement).checked).toBe(true);
  });

  it('offers only the channel that has a sender, and preserves sibling keys', async () => {
    const user = userEvent.setup();
    mocks.getCloudPreferenceNamespace.mockResolvedValue({
      browserReplyReady: true,
      legacyEmailDigest: false,
    });

    render(<CloudNotificationsSection />);
    await user.click(await screen.findByLabelText('Reply ready'));

    await waitFor(() =>
      expect(mocks.saveCloudPreferenceNamespace).toHaveBeenCalledWith('notifications', {
        browserReplyReady: false,
        legacyEmailDigest: false,
      }),
    );
    expect(screen.queryByLabelText(/weekly digest/i)).toBeNull();
  });
});

describe('CloudTimeFocusSection', () => {
  it('normalizes a malformed stored schedule instead of half-applying it', async () => {
    mocks.getCloudPreferenceNamespace.mockResolvedValue({
      breakReminderMinutes: 17,
      quietHours: { enabled: true, days: ['not-a-day'], startTime: '99:99', endTime: '08:00' },
    });

    render(<CloudTimeFocusSection />);

    const breakSelect = (await screen.findByLabelText('Break reminder')) as HTMLSelectElement;
    // 17 is not one of BREAK_REMINDER_MINUTES, so it falls back to "Off".
    expect(breakSelect.value).toBe('');
    expect((screen.getByLabelText('Enable quiet hours') as HTMLInputElement).checked).toBe(false);
  });

  it('refuses to save quiet hours with no selected day', async () => {
    const user = userEvent.setup();

    render(<CloudTimeFocusSection />);
    await user.click(await screen.findByLabelText('Enable quiet hours'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one quiet-hours day/i);
    expect(mocks.saveCloudPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('saves a valid schedule to the shared time-focus namespace', async () => {
    const user = userEvent.setup();

    render(<CloudTimeFocusSection />);
    await user.click(await screen.findByLabelText('Enable quiet hours'));
    await user.click(screen.getByRole('button', { name: 'Monday' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.saveCloudPreferenceNamespace).toHaveBeenCalled());
    const [namespace, value] = mocks.saveCloudPreferenceNamespace.mock.calls[0] as [
      string,
      { quietHours: { enabled: boolean; days: number[] } },
    ];
    expect(namespace).toBe('time-focus');
    expect(value.quietHours.enabled).toBe(true);
    expect(value.quietHours.days).toEqual([1]);
  });
});

describe('CloudReflectSection', () => {
  const recap = {
    range: '30d' as const,
    generatedAt: '2026-08-01T00:00:00.000Z',
    period: {
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
      label: 'Past 30 days',
    },
    summary: { headline: 'Steady month', body: 'You had a consistent month.' },
    stats: {
      totalConversations: 4,
      activeDays: 2,
      mostActiveDay: '2026-07-04',
      peakHour: 9,
    },
    dailyActivity: [{ date: '2026-07-04', conversationCount: 3 }],
    topics: [],
    insights: [],
    sampled: false,
    sampledConversationCount: 0,
  };

  it('renders the account recap inline', async () => {
    mocks.fetchCloudReflectRecap.mockResolvedValue(recap);

    render(<CloudReflectSection />);

    expect(await screen.findByText('Steady month')).toBeTruthy();
    expect(mocks.fetchCloudReflectRecap).toHaveBeenCalledWith('30d', expect.any(String));
  });

  it('explains that memory is off rather than showing a failure', async () => {
    mocks.fetchCloudReflectRecap.mockRejectedValue(new CloudReflectMemoryRequiredError());

    render(<CloudReflectSection />);

    expect(await screen.findByText('Memory is off')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reloads with the selected range', async () => {
    const user = userEvent.setup();
    mocks.fetchCloudReflectRecap.mockResolvedValue(recap);

    render(<CloudReflectSection />);
    await screen.findByText('Steady month');

    await user.selectOptions(screen.getByLabelText('Reflect range'), '90d');

    await waitFor(() =>
      expect(mocks.fetchCloudReflectRecap).toHaveBeenLastCalledWith('90d', expect.any(String)),
    );
  });
});

describe('CloudPluginsSection', () => {
  it('states there is nothing to manage instead of bridging to a non-existent page', async () => {
    const user = userEvent.setup();

    render(<CloudPluginsSection />);

    expect(screen.getByTestId('cloud-plugins')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in again to manage this' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Browse the plugin catalogue' }));

    await waitFor(() => expect(mocks.openExternalUrl).toHaveBeenCalled());
    expect(String(mocks.openExternalUrl.mock.calls[0]?.[0])).toContain('/apps');
  });

  it('routes to the extension surfaces that are actually wired', async () => {
    const user = userEvent.setup();
    const onOpenSection = vi.fn();

    render(<CloudPluginsSection onOpenSection={onOpenSection} />);
    await user.click(screen.getByRole('button', { name: 'Open Connectors' }));

    expect(onOpenSection).toHaveBeenCalledWith('connectors');
  });
});

describe('CloudTeamSection', () => {
  const organization = {
    id: 'org_1',
    name: 'Acme',
    slug: 'acme',
    memberCount: 2,
    maxMembers: null,
    currentUserRole: 'owner' as const,
  };
  const members = [
    {
      id: 'org_1:user_1',
      userId: 'user_1',
      email: 'founder@example.com',
      name: 'Founder',
      role: 'owner' as const,
      isCurrentUser: true,
    },
    {
      id: 'org_1:user_2',
      userId: 'user_2',
      email: 'teammate@example.com',
      name: 'Teammate',
      role: 'member' as const,
      isCurrentUser: false,
    },
  ];

  it('renders the workspace roster inline', async () => {
    mocks.getCloudOrganizationOverview.mockResolvedValue({ organization, canManageTeam: true });
    mocks.listCloudTeamMembers.mockResolvedValue(members);

    render(<CloudTeamSection />);

    expect(await screen.findByText('Acme')).toBeTruthy();
    expect(await screen.findByText('Teammate')).toBeTruthy();
    expect(mocks.listCloudTeamMembers).toHaveBeenCalledWith('org_1');
  });

  it('changes a role through the composite member id', async () => {
    const user = userEvent.setup();
    mocks.getCloudOrganizationOverview.mockResolvedValue({ organization, canManageTeam: true });
    mocks.listCloudTeamMembers.mockResolvedValue(members);
    mocks.updateCloudTeamMemberRole.mockResolvedValue(undefined);

    render(<CloudTeamSection />);
    await user.selectOptions(await screen.findByLabelText('Role for Teammate'), 'admin');

    await waitFor(() =>
      expect(mocks.updateCloudTeamMemberRole).toHaveBeenCalledWith('org_1:user_2', 'admin'),
    );
  });

  it('hides every admin control when the server says the account cannot manage a team', async () => {
    mocks.getCloudOrganizationOverview.mockResolvedValue({ organization, canManageTeam: false });
    mocks.listCloudTeamMembers.mockResolvedValue(members);

    render(<CloudTeamSection />);
    await screen.findByText('Teammate');

    expect(screen.queryByLabelText('Role for Teammate')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull();
  });

  it('surfaces the server refusal when adding an unknown address', async () => {
    const user = userEvent.setup();
    mocks.getCloudOrganizationOverview.mockResolvedValue({ organization, canManageTeam: true });
    mocks.listCloudTeamMembers.mockResolvedValue(members);
    mocks.addCloudTeamMember.mockRejectedValue(new Error('No AGI account exists for that email'));

    render(<CloudTeamSection />);
    await user.type(await screen.findByLabelText('Email address'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No AGI account exists'),
    );
  });

  it('does not pretend a workspace exists when the account has none', async () => {
    mocks.getCloudOrganizationOverview.mockResolvedValue({
      organization: null,
      canManageTeam: false,
    });

    render(<CloudTeamSection />);

    expect(await screen.findByText('No workspace yet')).toBeTruthy();
    expect(mocks.listCloudTeamMembers).not.toHaveBeenCalled();
  });
});
