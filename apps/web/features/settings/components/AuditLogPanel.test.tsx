import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  logs: [] as Array<{
    id: string;
    userId: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    details: Record<string, unknown>;
    ipAddress: string | null;
    createdAt: string;
  }>,
  actions: ['login', 'settings_change'],
  isLoading: false,
  isError: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
  useAuditLogs: vi.fn(),
}));

vi.mock('../hooks/use-settings-queries', () => ({
  useAuditLogs: (filters: unknown) => {
    state.useAuditLogs(filters);
    return {
      data: state.logs,
      isLoading: state.isLoading,
      isError: state.isError,
      isFetching: state.isFetching,
      error: state.error,
      refetch: state.refetch,
    };
  },
  useAuditLogActions: () => ({
    data: state.actions,
    isLoading: false,
  }),
}));

import { AuditLogPanel } from './AuditLogPanel';

describe('AuditLogPanel', () => {
  beforeEach(() => {
    state.logs = [];
    state.actions = ['login', 'settings_change'];
    state.isLoading = false;
    state.isError = false;
    state.isFetching = false;
    state.error = null;
    vi.clearAllMocks();
  });

  it('renders account audit entries from the live settings query', () => {
    state.logs = [
      {
        id: 'audit-1',
        userId: 'user-1',
        action: 'settings_change',
        resourceType: 'preferences',
        resourceId: 'privacy',
        details: {},
        ipAddress: '127.0.0.1',
        createdAt: '2026-07-29T20:15:00.000Z',
      },
    ];

    render(<AuditLogPanel />);

    const entries = screen.getByRole('list', { name: 'Security activity entries' });
    expect(within(entries).getByText('Settings Change')).toBeVisible();
    expect(screen.getByText('preferences · privacy')).toBeVisible();
    expect(entries).toBeVisible();
    expect(state.useAuditLogs).toHaveBeenCalledWith({
      action: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it('passes the selected action into the audit-log query', () => {
    render(<AuditLogPanel />);

    fireEvent.change(screen.getByLabelText('Filter security activity'), {
      target: { value: 'login' },
    });

    expect(state.useAuditLogs).toHaveBeenLastCalledWith({
      action: 'login',
      limit: 20,
      offset: 0,
    });
  });

  it('pages through complete result sets and supports refresh', () => {
    state.logs = Array.from({ length: 20 }, (_, index) => ({
      id: `audit-${index}`,
      userId: 'user-1',
      action: 'login',
      resourceType: null,
      resourceId: null,
      details: {},
      ipAddress: null,
      createdAt: '2026-07-29T20:15:00.000Z',
    }));

    render(<AuditLogPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Next security activity page' }));

    expect(state.useAuditLogs).toHaveBeenLastCalledWith({
      action: undefined,
      limit: 20,
      offset: 20,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh security activity' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it('shows a retryable error instead of an empty state', () => {
    state.isError = true;
    state.error = new Error('HTTP 503');

    render(<AuditLogPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 503');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
