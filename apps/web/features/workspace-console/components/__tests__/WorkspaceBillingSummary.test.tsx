import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseOrganizationOverview } = vi.hoisted(() => ({
  mockUseOrganizationOverview: vi.fn(),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', () => ({
  useOrganizationOverview: mockUseOrganizationOverview,
}));

import { WorkspaceBillingSummary } from '../WorkspaceBillingSummary';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function collectionState(overrides: Record<string, unknown> = {}) {
  return {
    stage: 'current',
    daysPastDue: 0,
    oldestOpenInvoiceDueAt: null,
    seatExpansionBlocked: false,
    newPaidUsageBlocked: false,
    readOnly: false,
    ...overrides,
  };
}

const fetchMock = vi.fn();

function ready(overrides: Record<string, unknown> = {}) {
  mockUseOrganizationOverview.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        plan: 'team',
        memberCount: 5,
        maxMembers: 10,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        currentUserRole: 'owner',
      },
      activeOrganizationId: 'org-1',
      workspaces: [],
      access: {
        plan: 'team',
        canManageTeam: true,
        maxMembers: 10,
        seatsConsumed: 5,
        seatsAvailable: 5,
        seatSource: 'billing',
      },
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(
    jsonResponse({
      organization: { currentUserRole: 'owner' },
      collectionState: collectionState(),
    }),
  );
});

describe('WorkspaceBillingSummary', () => {
  it('renders plan and seats without a billing-hold banner when current on payment', async () => {
    ready();
    render(<WorkspaceBillingSummary />);

    expect(screen.getByText('Plan and seats')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the workspace-wide billing-hold banner above the plan card once overdue', async () => {
    ready();
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'owner' },
        collectionState: collectionState({ stage: 'past_due_60', daysPastDue: 45 }),
      }),
    );

    render(<WorkspaceBillingSummary />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('45 days past due');
    expect(screen.getByText('Plan and seats')).toBeTruthy();
  });

  it('shows the read-only-only notice to a member console viewer', async () => {
    ready({
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        plan: 'team',
        memberCount: 5,
        maxMembers: 10,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        currentUserRole: 'member',
      },
    });
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'member' },
        collectionState: collectionState({ stage: 'read_only', daysPastDue: 95, readOnly: true }),
      }),
    );

    render(<WorkspaceBillingSummary />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('read-only');
  });
});
