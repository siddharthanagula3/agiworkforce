import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  logs: {
    entries: [] as Array<{
      id: string;
      action: string;
      sentence: string;
      device: string | null;
      createdAt: string;
    }>,
    hasMore: false,
  },
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
    state.logs = { entries: [], hasMore: false };
    state.actions = ['login', 'settings_change'];
    state.isLoading = false;
    state.isError = false;
    state.isFetching = false;
    state.error = null;
    vi.clearAllMocks();
  });

  it('renders account audit entries from the live settings query', () => {
    state.logs = {
      entries: [
        {
          id: 'audit-1',
          action: 'settings_change',
          sentence: 'Changed settings',
          device: 'Chrome on Mac',
          createdAt: '2026-07-29T20:15:00.000Z',
        },
      ],
      hasMore: false,
    };

    render(<AuditLogPanel />);

    const entries = screen.getByRole('list', { name: 'Security activity entries' });
    expect(within(entries).getByText('Changed settings')).toBeVisible();
    expect(screen.getByText('Chrome on Mac')).toBeVisible();
    expect(entries).not.toHaveTextContent('127.0.0.1');
    expect(entries).not.toHaveTextContent('preferences');
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
    state.logs = {
      entries: Array.from({ length: 20 }, (_, index) => ({
        id: `audit-${index}`,
        action: 'login',
        sentence: 'Signed in on a new device',
        device: null,
        createdAt: '2026-07-29T20:15:00.000Z',
      })),
      hasMore: true,
    };

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

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong on our side. Try again shortly.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('HTTP');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
