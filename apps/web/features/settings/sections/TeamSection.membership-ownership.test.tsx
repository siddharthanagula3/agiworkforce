import {
  client, deferred, fetchMock, fixture, getCsrfToken, identity, json, leaveReceipt,
  LEAVE_PATH, ORG, OTHER_ORG, reads, transferReceipt, transport, workspace, wrapper, writes,
} from '../hooks/__tests__/organization-membership-fixture';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamMember } from '../hooks/use-settings-queries';

const team = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'member',
  members: [] as TeamMember[],
}));
vi.mock('../hooks/use-settings-queries', async (original) => ({
  ...await original<typeof import('../hooks/use-settings-queries')>(),
  useOrganizationOverview: () => ({ data: {
    organization: { id: ORG, name: 'Unowned overview label', slug: 'research', plan: 'team',
      memberCount: 2, maxMembers: null, currentUserRole: team.role },
    access: { plan: 'team', canManageTeam: true, maxMembers: null, seatsConsumed: null,
      seatsAvailable: null, seatSource: 'unknown' },
    activeOrganizationId: ORG, workspaces: [],
  }, isLoading: false, isError: false, refetch: vi.fn() }),
  useTeamMembers: () => ({ data: team.members, isLoading: false, isError: false, refetch: vi.fn() }),
  useTeamSeatTypes: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useTeamInvitations: () => ({ data: { invitations: [], seats: null }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('./team/SSOPanel', () => ({ SSOPanel: () => null }));
vi.mock('@/features/workspaces/lib/workspace-switch-interruptions', async (original) => ({
  ...await original<typeof import('@/features/workspaces/lib/workspace-switch-interruptions')>(),
  useWorkspaceSwitchInterruptions: () => [],
}));

import { TeamSection } from './TeamSection';

function member(userId: string, role: TeamMember['role'] = 'member'): TeamMember {
  return { id: `${ORG}:${userId}`, userId, organizationId: ORG, email: `${userId}@example.com`,
    name: userId === 'successor' ? 'Successor' : 'Other member', avatarUrl: null, role,
    status: 'active', provisionedAt: null, joinedAt: null, lastActiveAt: null,
    permissions: [], isCurrentUser: false, seatType: 'standard', premiumPaidThrough: null };
}
function retainClick(node: HTMLElement) {
  const key = Object.keys(node).find((candidate) => candidate.startsWith('__reactProps$'));
  if (!key) throw new Error('Rendered React button props are unavailable');
  const props = (node as unknown as Record<string, { onClick: (event: MouseEvent) => void }>)[key];
  if (!props) throw new Error('Rendered React button props are missing');
  const retained = props.onClick;
  return () => retained(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const chooseTransfer = () => {
  fireEvent.change(screen.getByTestId('transfer-ownership-member'), { target: { value: 'successor' } });
  fireEvent.change(screen.getByTestId('transfer-ownership-outgoing-role'), { target: { value: 'viewer' } });
};
async function mount() {
  const mounted = render(<TeamSection />, { wrapper });
  await waitFor(() => expect(screen.getByLabelText('New workspace owner')).toBeEnabled());
  return mounted;
}
function openTransfer() {
  chooseTransfer();
  fireEvent.click(screen.getByTestId('transfer-ownership-submit'));
  return screen.getByRole('alertdialog');
}
beforeEach(() => {
  team.role = 'owner';
  team.members = [member(fixture.accountId, 'owner'), member('successor'), member('replacement')];
});

describe('Team membership real transport and confirmation', () => {
  it('names the canonical workspace and preserves the exact target and role from confirmation', async () => {
    team.role = 'member';
    await mount();
    const dialog = openTransfer();
    expect(dialog).toHaveTextContent('Successor becomes the owner of Research');
    expect(dialog).toHaveTextContent('You become Viewer');
    expect(dialog).not.toHaveTextContent('Unowned overview label');
    fireEvent.change(screen.getByTestId('transfer-ownership-member'), { target: { value: 'replacement' } });
    fireEvent.change(screen.getByTestId('transfer-ownership-outgoing-role'), { target: { value: 'admin' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await screen.findByText('Ownership transferred');
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ organizationId: ORG, toUserId: 'successor', outgoingOwnerRole: 'viewer' });
    expect(screen.getByText('Ownership was transferred. Your role is now Viewer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(reads()).toHaveLength(1);
  });

  it('excludes the captured actor and other-workspace members even when overview flags claim otherwise', async () => {
    team.members[0]!.isCurrentUser = false;
    team.members[1]!.isCurrentUser = true;
    team.members.push({ ...member('foreign-member'), organizationId: OTHER_ORG });
    await mount();
    const select = screen.getByTestId('transfer-ownership-member');
    const options = within(select).getAllByRole('option').map((node) => (node as HTMLOptionElement).value);
    expect(options).toContain('successor');
    expect(fixture.accountId).not.toBe(fixture.auth.userId);
    expect(options).not.toContain(fixture.accountId);
    expect(options).not.toContain('foreign-member');
  });

  it('does not elevate an admitted member from the unowned overview owner role', async () => {
    fetchMock.mockImplementation(async () => json({ ...workspace(), workspaces: workspace().workspaces.map((item) => ({ ...item, role: 'member' })) }));
    render(<TeamSection />, { wrapper });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Leave workspace' })).toBeEnabled());
    expect(screen.queryByTestId('transfer-ownership-submit')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('lose access to Research');
    expect(screen.queryByRole('button', { name: 'Transfer and leave' })).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('retains a warning receipt and exact zero counts until Continue refreshes canonical B', async () => {
    const receipt = { ...leaveReceipt('successor'), warnings: ['Some cleanup is incomplete.'] };
    transport(async () => json(receipt));
    await mount();
    fireEvent.change(screen.getByLabelText('New workspace owner'), { target: { value: 'successor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership and leave' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Successor becomes owner of Research');
    expect(dialog).toHaveTextContent('Cleanup will attempt');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer and leave' }));
    await screen.findByText('You left the workspace');
    expect(screen.getByText(/The server reports 0 device tokens, 0 API keys and 0 sessions revoked, and 0 shared connectors disconnected/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Some credential or connector cleanup could not be confirmed');
    expect(screen.queryByText('No cleanup problems were reported.')).toBeNull();
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(reads()).toHaveLength(1);
    fetchMock.mockImplementation(async () => json(workspace(OTHER_ORG)));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(fixture.navigate).toHaveBeenCalledOnce());
    expect(fixture.finalize).toHaveBeenCalledWith(client, OTHER_ORG, expect.anything(), undefined, fixture.accountId);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![0]).toBe(LEAVE_PATH);
  });

  it('shows unknown outcome without a success panel or another send', async () => {
    transport(async () => { throw new TypeError('Lost response'); });
    await mount();
    const dialog = openTransfer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await screen.findByText('Workspace outcome unconfirmed');
    expect(screen.queryByText('Ownership transferred')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload to check workspace' })).toBeEnabled();
    expect(screen.queryByTestId('transfer-ownership-submit')).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.finalize).not.toHaveBeenCalled();
  });

  it('keeps a replacement confirmation alive when a retired Team opener is invoked after reopening', async () => {
    const mounted = await mount();
    chooseTransfer();
    const oldOpener = retainClick(screen.getByTestId('transfer-ownership-submit'));
    fireEvent.click(screen.getByTestId('transfer-ownership-submit'));
    const oldConfirmation = retainClick(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Transfer ownership' }));
    mounted.rerender(<TeamSection active={false} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    mounted.rerender(<TeamSection active />);
    await waitFor(() => expect(screen.getByLabelText('New workspace owner')).toBeEnabled());
    const replacement = openTransfer();
    act(() => { oldOpener(); oldConfirmation(); });
    expect(screen.getByRole('alertdialog')).toBe(replacement);
    expect(replacement).toHaveTextContent('Successor becomes the owner of Research');
    expect(writes()).toHaveLength(0);
    fireEvent.click(within(replacement).getByRole('button', { name: 'Transfer ownership' }));
    await screen.findByText('Ownership transferred');
    expect(writes()).toHaveLength(1);
  });

  it('hides a late receipt after Settings closes and preserves replacement-account state', async () => {
    const response = deferred<Response>();
    transport(async () => response.promise);
    const mounted = await mount();
    const dialog = openTransfer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    mounted.rerender(<TeamSection active={false} />);
    act(() => identity());
    mounted.rerender(<TeamSection active />);
    client.setQueryData(['replacement'], { kept: true });
    await act(async () => response.resolve(json(transferReceipt())));
    expect(screen.queryByText('Ownership transferred')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(client.getQueryData(['replacement'])).toEqual({ kept: true });
    expect(writes()[0]![1]?.signal?.aborted).toBe(true);
    expect(fixture.finalize).not.toHaveBeenCalled();
  });

  it('does not restore an old critical draft or opener when canonical account mapping returns A to B to A', async () => {
    await mount();
    const originalAccount = fixture.accountId;
    chooseTransfer();
    const oldOpener = retainClick(screen.getByTestId('transfer-ownership-submit'));
    fixture.accountId = 'temporary-product-account';
    act(() => client.setQueriesData({ queryKey: ['workspaces'] }, workspace()));
    await waitFor(() => expect(screen.getByTestId('transfer-ownership-member')).toHaveValue(''));
    expect(within(screen.getByTestId('transfer-ownership-member')).getAllByRole('option')
      .map((node) => (node as HTMLOptionElement).value)).toContain(originalAccount);
    expect(screen.getByTestId('transfer-ownership-outgoing-role')).toHaveValue('admin');
    fixture.accountId = originalAccount;
    act(() => client.setQueriesData({ queryKey: ['workspaces'] }, workspace()));
    await waitFor(() => expect(within(screen.getByTestId('transfer-ownership-member')).getAllByRole('option')
      .map((node) => (node as HTMLOptionElement).value)).not.toContain(originalAccount));
    act(() => oldOpener());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('transfer-ownership-member')).toHaveValue('');
    expect(screen.getByTestId('transfer-ownership-outgoing-role')).toHaveValue('admin');
    expect(writes()).toHaveLength(0);
    const fresh = openTransfer();
    fireEvent.click(within(fresh).getByRole('button', { name: 'Transfer ownership' }));
    await screen.findByText('Ownership transferred');
    expect(writes()).toHaveLength(1);
  });

  it('retires a confirmed operation during CSRF acquisition on retained Settings close', async () => {
    const pending = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
    const mounted = await mount();
    const dialog = openTransfer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalledOnce());
    mounted.rerender(<TeamSection active={false} />);
    await act(async () => pending.resolve('late-csrf'));
    expect(writes()).toHaveLength(0);
    expect(fixture.finalize).not.toHaveBeenCalled();
    mounted.rerender(<TeamSection active />);
    await waitFor(() => expect(screen.getByLabelText('New workspace owner')).toBeEnabled());
    const fresh = openTransfer();
    fireEvent.click(within(fresh).getByRole('button', { name: 'Transfer ownership' }));
    await screen.findByText('Ownership transferred');
    expect(writes()).toHaveLength(1);
  });
});
