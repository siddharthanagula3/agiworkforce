import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterpriseCollectionBanner } from '../EnterpriseCollectionBanner';

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('EnterpriseCollectionBanner', () => {
  it('renders nothing when the workspace is current on payment', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'owner' },
        collectionState: collectionState(),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing when there is no active organization', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ organization: null, collectionState: null }));

    render(<EnterpriseCollectionBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a plain-words past-due-30 notice to an owner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'owner' },
        collectionState: collectionState({ stage: 'past_due_30', daysPastDue: 12 }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('12 days past due');
    expect(alert.textContent).toContain('Contact your billing owner');
  });

  it('escalates the tone for past-due-60 for an admin', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'admin' },
        collectionState: collectionState({ stage: 'past_due_60', daysPastDue: 45 }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('significantly overdue');
  });

  it('names what is blocked at past-due-90 for an admin', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'admin' },
        collectionState: collectionState({
          stage: 'past_due_90',
          daysPastDue: 75,
          seatExpansionBlocked: true,
          newPaidUsageBlocked: true,
        }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('seats');
    expect(alert.textContent).toContain('new paid usage commitments are on hold');
  });

  it('uses read-only wording past day 90 for an owner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'owner' },
        collectionState: collectionState({
          stage: 'read_only',
          daysPastDue: 95,
          seatExpansionBlocked: true,
          newPaidUsageBlocked: true,
          readOnly: true,
        }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('read-only');
  });

  it('hides the past-due-30 through past-due-90 notices from a plain member', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'member' },
        collectionState: collectionState({ stage: 'past_due_90', daysPastDue: 75 }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows only the read-only notice to a plain member, without billing detail', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        organization: { currentUserRole: 'member' },
        collectionState: collectionState({ stage: 'read_only', daysPastDue: 95, readOnly: true }),
      }),
    );

    render(<EnterpriseCollectionBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('read-only');
    expect(alert.textContent).toContain('Contact your workspace owner');
    expect(alert.textContent).not.toContain('95 days');
  });

  it('stays silent when the request fails, rather than blocking the page', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    render(<EnterpriseCollectionBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
