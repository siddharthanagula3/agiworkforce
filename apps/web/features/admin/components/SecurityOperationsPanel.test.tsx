import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SecurityOperationsPanel from './SecurityOperationsPanel';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  fetchOperations: vi.fn(),
  performAction: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));

vi.mock('../services/admin-security-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/admin-security-client')>();
  return {
    ...actual,
    fetchAdminSecurityOperations: mocks.fetchOperations,
    performAdminAccountAction: mocks.performAction,
  };
});

const OPERATIONS = {
  dashboard: {
    metrics: {
      total_events_24h: 17,
      total_events_7d: 40,
      unique_ips_24h: 4,
      unique_users_24h: 6,
      critical_events_24h: 2,
      high_severity_events_24h: 3,
    },
    alerts: [
      {
        alert_name: 'Critical Events Spike',
        triggered: true,
        current_count: 6,
        threshold: 5,
        window_minutes: 60,
        severity: 'critical' as const,
      },
    ],
    recent_critical: [],
    top_ips: [{ ip_address: '203.0.113.7', event_count: 9 }],
  },
  events: [
    {
      id: 'event-1',
      user_id: 'user-target',
      event_type: 'authorization_failed',
      severity: 'high' as const,
      ip_address: '203.0.113.7',
      endpoint: '/api/private',
      created_at: '2026-07-31T12:00:00.000Z',
    },
  ],
};

describe('SecurityOperationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue('session-token');
    mocks.fetchOperations.mockResolvedValue(OPERATIONS);
    mocks.performAction.mockResolvedValue({
      message: 'User user-target has been suspended',
      account_status: 'suspended',
    });
  });

  it('renders live metrics, alerts, events, and source IP data', async () => {
    render(<SecurityOperationsPanel />);

    expect(await screen.findByText('authorization_failed')).toBeInTheDocument();
    expect(screen.getByText('Critical Events Spike')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(mocks.fetchOperations).toHaveBeenCalledWith('session-token');
  });

  it('submits an audited account action and refreshes live state', async () => {
    render(<SecurityOperationsPanel />);
    await screen.findByText('authorization_failed');

    fireEvent.change(screen.getByLabelText('Target user ID'), {
      target: { value: 'user-target' },
    });
    fireEvent.change(screen.getByLabelText('Audit reason'), {
      target: { value: 'Confirmed abuse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));

    await waitFor(() => {
      expect(mocks.performAction).toHaveBeenCalledWith(
        'session-token',
        'suspend-user',
        'user-target',
        'Confirmed abuse',
      );
    });
    expect(await screen.findByText('User user-target has been suspended')).toBeInTheDocument();
    expect(mocks.fetchOperations).toHaveBeenCalledTimes(2);
  });
});
