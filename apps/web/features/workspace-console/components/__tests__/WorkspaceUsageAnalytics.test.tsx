import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceUsageAnalytics } from '../WorkspaceUsageAnalytics';
import { PRIVACY_MODE_DISPLAY } from '@agiworkforce/types';

const CLOUD = PRIVACY_MODE_DISPLAY.managed.label;

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../hooks/use-workspace-usage', () => ({
  useWorkspaceUsage: mocks.query,
  WORKSPACE_USAGE_QUERY_KEY: ['workspace', 'usage-analytics'],
}));
vi.mock('../WorkspaceSpendLimit', () => ({ WorkspaceSpendLimit: () => null }));

const NONE_OMITTED = { requests: 0, credits: 0 };

function usage(unsettledRequests: number) {
  return {
    organizationId: 'qa-workspace',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-19T10:00:00.000Z',
    totals: { requests: 0, credits: 0, inputTokens: 0, outputTokens: 0 },
    members: { active: 0, seatsInUse: 4 as number | null },
    byMember: [],
    byModel: [],
    byProvider: [],
    byWorkload: [],
    byProject: [],
    omitted: {
      byMember: NONE_OMITTED,
      byModel: NONE_OMITTED,
      byProvider: NONE_OMITTED,
      byWorkload: NONE_OMITTED,
      byProject: NONE_OMITTED,
    },
    daily: [],
    freshness: { asOf: '2026-09-19T10:00:00.000Z', latestActivityAt: null, unsettledRequests },
  };
}

describe('WorkspaceUsageAnalytics settlement visibility', () => {
  beforeEach(() => {
    mocks.query.mockReturnValue({
      data: { currentUserRole: 'owner', usage: usage(0) },
      isPending: false,
      isError: false,
    });
  });

  it('distinguishes pending settlement from no activity and keeps settled credits unchanged', () => {
    mocks.query.mockReturnValue({
      data: { currentUserRole: 'owner', usage: usage(2) },
      isPending: false,
      isError: false,
    });
    render(<WorkspaceUsageAnalytics />);
    expect(screen.getByText(/2 requests are awaiting settlement/)).toBeInTheDocument();
    expect(screen.getByText(`No settled ${CLOUD} usage in this window`)).toBeInTheDocument();
    expect(screen.getByText('0 credits')).toBeInTheDocument();
    expect(screen.queryByText(/has cost nothing/)).not.toBeInTheDocument();
  });

  it('shows the snapshot time and scopes the explanation to managed billing', () => {
    const { container } = render(<WorkspaceUsageAnalytics />);
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-09-19T10:00:00.000Z');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Settled ${CLOUD} usage only. Local and BYOK activity is not included`),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/never reaches our infrastructure/)).not.toBeInTheDocument();
  });

  it('breaks credits down per member for an administrator, with no dollar figure', () => {
    mocks.query.mockReturnValue({
      data: {
        currentUserRole: 'admin',
        usage: {
          ...usage(0),
          totals: { requests: 7, credits: 2_500, inputTokens: 900, outputTokens: 300 },
          byMember: [
            {
              key: 'ada@example.com',
              requests: 5,
              inputTokens: 600,
              outputTokens: 200,
              credits: 2_000,
            },
            {
              key: 'alan@example.com',
              requests: 2,
              inputTokens: 300,
              outputTokens: 100,
              credits: 500,
            },
          ],
        },
      },
      isPending: false,
      isError: false,
    });
    const { container } = render(<WorkspaceUsageAnalytics />);

    const byMember = screen.getByRole('region', { name: 'By member' });
    const rows = within(byMember).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('ada@example.com'),
      expect.stringContaining('alan@example.com'),
    ]);
    expect(rows[0]).toHaveTextContent('2,000 credits');
    expect(rows[1]).toHaveTextContent('500 credits');
    expect(within(byMember).getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument();
    expect(within(rows[0]!).getAllByRole('cell')[0]).toHaveTextContent(/^1$/);
    expect(within(rows[1]!).getAllByRole('cell')[0]).toHaveTextContent(/^2$/);
    expect(
      within(screen.getByRole('region', { name: 'By model' })).queryByRole('columnheader', {
        name: 'Rank',
      }),
    ).toBeNull();
    expect(screen.getByText('2,500 credits')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('$');
  });

  it('says how much usage a capped member list leaves out and that the totals include it', () => {
    mocks.query.mockReturnValue({
      data: {
        currentUserRole: 'owner',
        usage: {
          ...usage(0),
          totals: { requests: 51, credits: 510, inputTokens: 0, outputTokens: 0 },
          byMember: [
            { key: 'ada@example.com', requests: 50, inputTokens: 0, outputTokens: 0, credits: 500 },
          ],
          omitted: {
            ...usage(0).omitted,
            byMember: { requests: 1, credits: 10 },
          },
        },
      },
      isPending: false,
      isError: false,
    });
    render(<WorkspaceUsageAnalytics />);

    const byMember = screen.getByRole('region', { name: 'By member' });
    expect(byMember).toHaveTextContent('Showing the top 1.');
    expect(byMember).toHaveTextContent('1 more turns and 10 credits are not listed here');
    expect(
      within(screen.getByRole('region', { name: 'By model' })).queryByText(/not listed here/),
    ).toBeNull();
  });

  it('tells someone who does not administer the workspace why there is no breakdown', () => {
    mocks.query.mockReturnValue({ data: null, isPending: false, isError: false });
    render(<WorkspaceUsageAnalytics />);

    expect(screen.getByText('You do not administer this workspace')).toBeVisible();
    expect(screen.getByText(/Per-member usage is limited to owners and admins/)).toBeVisible();
    expect(screen.queryByRole('region', { name: 'By member' })).toBeNull();
  });

  it('exports the exact displayed window through the reviewed workspace endpoint', () => {
    render(<WorkspaceUsageAnalytics />);

    expect(screen.getByRole('link', { name: 'Export daily CSV' })).toHaveAttribute(
      'href',
      '/api/settings/organization/usage-analytics/export?from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-19T10%3A00%3A00.000Z&dimension=daily',
    );
  });

  it('labels each daily bar with its UTC calendar day rather than a browser-shifted date', () => {
    mocks.query.mockReturnValue({
      data: {
        currentUserRole: 'owner',
        usage: { ...usage(0), daily: [{ day: '2026-11-09', requests: 1, credits: 5 }] },
      },
      isPending: false,
      isError: false,
    });
    const { container } = render(<WorkspaceUsageAnalytics />);

    const bar = container.querySelector('[aria-label="Daily credits used"] span');
    const utcDay = new Date(Date.UTC(2026, 10, 9)).toLocaleDateString(undefined, {
      timeZone: 'UTC',
    });
    expect(bar?.getAttribute('title')?.startsWith(`${utcDay} UTC, `)).toBe(true);
  });

  it('shows active members against seats in use and the average credits per active member', () => {
    mocks.query.mockReturnValue({
      data: {
        currentUserRole: 'owner',
        usage: {
          ...usage(0),
          totals: { requests: 9, credits: 2_500, inputTokens: 900, outputTokens: 300 },
          members: { active: 2, seatsInUse: 5 },
        },
      },
      isPending: false,
      isError: false,
    });
    render(<WorkspaceUsageAnalytics />);

    const totals = screen.getByRole('region', { name: 'Managed cloud usage' });
    expect(within(totals).getByText('Active members').parentElement).toHaveTextContent(
      'Active members2 / 5Out of seats in use',
    );
    expect(within(totals).getByText('Avg credits / active member').parentElement).toHaveTextContent(
      '1,250 credits',
    );
  });

  it('shows only the active count when seats are not readable, and no average without activity', () => {
    mocks.query.mockReturnValue({
      data: {
        currentUserRole: 'owner',
        usage: { ...usage(0), members: { active: 0, seatsInUse: null } },
      },
      isPending: false,
      isError: false,
    });
    render(<WorkspaceUsageAnalytics />);

    const totals = screen.getByRole('region', { name: 'Managed cloud usage' });
    expect(within(totals).getByText('Active members').parentElement).toHaveTextContent(
      /^Active members0$/,
    );
    expect(within(totals).getByText('Avg credits / active member').parentElement).toHaveTextContent(
      /^Avg credits \/ active memberNone$/,
    );
  });
});
