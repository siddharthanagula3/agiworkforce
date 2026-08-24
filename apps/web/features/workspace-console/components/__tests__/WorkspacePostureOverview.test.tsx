import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUsePosture } = vi.hoisted(() => ({ mockUsePosture: vi.fn() }));

vi.mock('../../hooks/use-workspace-posture', () => ({
  useWorkspacePosture: mockUsePosture,
}));

import { WorkspacePostureOverview } from '../WorkspacePostureOverview';

function signal(over: Record<string, unknown> = {}) {
  return {
    id: 'managed-compute',
    label: 'Managed cloud compute',
    value: 'Allowed',
    state: 'ok',
    enforcement: 'enforced',
    detail: 'Checked on all seven managed-compute routes before a turn runs.',
    ...over,
  };
}

function ok(over: Record<string, unknown> = {}) {
  mockUsePosture.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      currentUserRole: 'owner',
      posture: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        organizationName: 'Acme',
        generatedAt: '2026-08-23T00:00:00.000Z',
        groups: [{ id: 'ai-controls', title: 'AI controls', signals: [signal()] }],
        recommendations: [],
        ...over,
      },
    },
  });
}

describe('WorkspacePostureOverview', () => {
  it('names the workspace and when the reading was taken', () => {
    ok();
    render(<WorkspacePostureOverview />);

    expect(screen.getByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText(/Read live from this workspace/i)).toBeInTheDocument();
  });

  it('labels an enforced signal as enforced', () => {
    ok();
    render(<WorkspacePostureOverview />);
    expect(screen.getByText('Enforced')).toBeInTheDocument();
  });

  it('never lets a stated position wear the enforced badge', () => {
    // The single most important assertion on this page. A recorded value shown
    // as a control is the fake-checkbox failure a security review exists to
    // catch.
    ok({
      groups: [
        {
          id: 'data',
          title: 'Data',
          signals: [
            signal({
              id: 'retention',
              label: 'Retention',
              value: '90 days',
              enforcement: 'stated',
              state: 'attention',
              detail: 'No job currently sweeps on it.',
            }),
          ],
        },
      ],
    });
    render(<WorkspacePostureOverview />);

    expect(screen.getByText('Stated position')).toBeInTheDocument();
    expect(screen.queryByText('Enforced')).not.toBeInTheDocument();
  });

  it('explains what a stated position means without making the reader guess', () => {
    ok();
    render(<WorkspacePostureOverview />);
    expect(screen.getByText(/no runtime check reads it yet/i)).toBeInTheDocument();
  });

  it('counts what needs attention in the header', () => {
    ok({
      groups: [
        {
          id: 'data',
          title: 'Data',
          signals: [signal({ id: 'retention', state: 'attention', enforcement: 'stated' })],
        },
      ],
    });
    render(<WorkspacePostureOverview />);
    expect(screen.getByText(/1 item needs attention/i)).toBeInTheDocument();
  });

  it('says so plainly when nothing is flagged', () => {
    ok();
    render(<WorkspacePostureOverview />);
    expect(screen.getByText(/Nothing is currently flagged/i)).toBeInTheDocument();
  });

  it('renders recommendations with a working destination', () => {
    ok({
      recommendations: [
        {
          id: 'configure-sso',
          title: 'Connect your identity provider',
          body: 'SAML 2.0 and OIDC are supported.',
          href: '/workspace/identity',
          cta: 'Configure SSO',
        },
      ],
    });
    render(<WorkspacePostureOverview />);

    expect(screen.getByRole('link', { name: 'Configure SSO' })).toHaveAttribute(
      'href',
      '/workspace/identity',
    );
  });

  it('omits the recommendations panel entirely when there are none', () => {
    ok();
    render(<WorkspacePostureOverview />);
    expect(screen.queryByRole('heading', { name: /recommended/i })).not.toBeInTheDocument();
  });

  it('shows a permission state, not an error, when the caller is not an admin', () => {
    mockUsePosture.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: null,
    });
    render(<WorkspacePostureOverview />);

    expect(screen.getByRole('heading', { name: /do not administer/i })).toBeInTheDocument();
  });

  it('offers a retry on failure rather than an empty page', () => {
    const refetch = vi.fn();
    mockUsePosture.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('Database temporarily unavailable'),
      refetch,
      data: undefined,
    });
    render(<WorkspacePostureOverview />);

    expect(screen.getByText('Database temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows a loading state instead of an empty frame', () => {
    mockUsePosture.mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
    const { container } = render(<WorkspacePostureOverview />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
