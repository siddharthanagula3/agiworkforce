import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceUsageAnalytics } from '../WorkspaceUsageAnalytics';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../hooks/use-workspace-usage', () => ({
  useWorkspaceUsage: mocks.query,
  WORKSPACE_USAGE_QUERY_KEY: ['workspace', 'usage-analytics'],
}));
vi.mock('../WorkspaceSpendLimit', () => ({ WorkspaceSpendLimit: () => null }));

function usage(unsettledRequests: number) {
  return {
    organizationId: 'qa-workspace',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-19T10:00:00.000Z',
    totals: { requests: 0, costCents: 0, inputTokens: 0, outputTokens: 0 },
    byMember: [],
    byModel: [],
    byProvider: [],
    byWorkload: [],
    byProject: [],
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

  it('distinguishes pending settlement from no activity and keeps settled spend unchanged', () => {
    mocks.query.mockReturnValue({
      data: { currentUserRole: 'owner', usage: usage(2) },
      isPending: false,
      isError: false,
    });
    render(<WorkspaceUsageAnalytics />);
    expect(screen.getByText(/2 requests are awaiting settlement/)).toBeInTheDocument();
    expect(screen.getByText('No settled managed usage in this window')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByText(/has cost nothing/)).not.toBeInTheDocument();
  });

  it('shows the snapshot time and scopes the explanation to managed billing', () => {
    const { container } = render(<WorkspaceUsageAnalytics />);
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-09-19T10:00:00.000Z');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Local and BYOK activity is not included in these managed cloud totals/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/never reaches our infrastructure/)).not.toBeInTheDocument();
  });

  it('exports the exact displayed window through the reviewed workspace endpoint', () => {
    render(<WorkspaceUsageAnalytics />);

    expect(screen.getByRole('link', { name: 'Export daily CSV' })).toHaveAttribute(
      'href',
      '/api/settings/organization/usage-analytics/export?from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-19T10%3A00%3A00.000Z&dimension=daily',
    );
  });
});
