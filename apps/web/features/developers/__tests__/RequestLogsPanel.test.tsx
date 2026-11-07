import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { observeWorkspaceOwner } from '@/features/workspaces/lib/workspace-admission';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_WORKSPACES_PATH,
  type DeveloperRequestLog,
} from '@agiworkforce/cloud-contracts';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'panel-user', sessionId: 'panel-session' },
  sdk: {
    loaded: true,
    user: { id: 'panel-user' },
    session: {
      id: 'panel-session',
      user: { id: 'panel-user' },
      getToken: async () => 'panel-token',
    },
  },
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { RequestLogsPanel } from '../components/RequestLogsPanel';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  observeWorkspaceOwner(null);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: RequestInfo | URL) => {
      if (String(path) !== MANAGED_CLOUD_WORKSPACES_PATH)
        throw new Error('Unexpected network request');
      return new Response(
        JSON.stringify({
          scope: 'personal',
          activeWorkspaceId: 'personal',
          activeOrganizationId: null,
          workspaces: [],
        }),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

function log(patch: Partial<DeveloperRequestLog> = {}): DeveloperRequestLog {
  return {
    id: '0190a000-0000-7000-8000-0000000000d1',
    createdAt: '2026-10-19T10:00:00.000Z',
    apiKeyName: 'CI key',
    apiKeyPrefix: 'sk_live_ab',
    status: 'completed',
    model: 'auto',
    servedModel: 'served-model',
    errorCode: null,
    credits: 3,
    inputTokens: 120,
    outputTokens: 40,
    reasoningTokens: null,
    cacheReadTokens: 0,
    webSearchRequests: 2,
    webFetchRequests: null,
    codeExecutionRuns: null,
    steps: [
      { name: 'received', at: '2026-10-19T10:00:00.000Z' },
      { name: 'provider_started', at: '2026-10-19T10:00:00.050Z' },
      { name: 'provider_answered', at: '2026-10-19T10:00:01.250Z' },
      { name: 'settled', at: '2026-10-19T10:00:01.300Z' },
    ],
    ...patch,
  };
}

describe('RequestLogsPanel', () => {
  it('lists requests and opens one into its timeline and usage', async () => {
    const fetchLogs = vi.fn(async () => ({ logs: [log()], nextBefore: null }));
    render(<RequestLogsPanel fetchLogs={fetchLogs} />, { wrapper });
    const row = await screen.findByRole('button', { expanded: false });
    expect(row).toHaveTextContent('served-model');
    expect(row).toHaveTextContent('1,300 ms');
    expect(row).toHaveTextContent('CI key');
    await userEvent.click(row);
    expect(screen.getByText('Model answered')).toBeInTheDocument();
    expect(screen.getByText('+1,250 ms')).toBeInTheDocument();
    expect(screen.getByText('Web searches')).toBeInTheDocument();
    expect(screen.queryByText('Cached input tokens')).toBeNull();
  });

  it('pages back through older requests', async () => {
    const fetchLogs = vi
      .fn()
      .mockResolvedValueOnce({ logs: [log()], nextBefore: '2026-10-19T10:00:00.000Z' })
      .mockResolvedValueOnce({
        logs: [log({ id: '0190a000-0000-7000-8000-0000000000d2', servedModel: 'older-model' })],
        nextBefore: null,
      });
    render(<RequestLogsPanel fetchLogs={fetchLogs} />, { wrapper });
    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(await screen.findByText('older-model')).toBeInTheDocument();
    expect(fetchLogs).toHaveBeenLastCalledWith('2026-10-19T10:00:00.000Z', {
      organizationId: null,
      request: expect.objectContaining({
        session: expect.objectContaining({
          userId: 'panel-user',
          sessionId: 'panel-session',
        }),
        assertCurrent: expect.any(Function),
        fetch: expect.any(Function),
      }),
    });
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
  });

  it('clears expanded details and the old cursor when the source changes, even for the same log ID', async () => {
    const firstSource = vi.fn(async () => ({ logs: [log()], nextBefore: 'old-cursor' }));
    let resolve!: (value: { logs: DeveloperRequestLog[]; nextBefore: null }) => void;
    const pending = new Promise<{ logs: DeveloperRequestLog[]; nextBefore: null }>((yes) => {
      resolve = yes;
    });
    const nextSource = vi.fn(() => pending);
    const { rerender } = render(<RequestLogsPanel fetchLogs={firstSource} />, { wrapper });
    await userEvent.click(await screen.findByRole('button', { expanded: false }));
    expect(screen.getByText('Model answered')).toBeInTheDocument();
    rerender(<RequestLogsPanel fetchLogs={nextSource} />);
    await waitFor(() => expect(nextSource).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Model answered')).toBeNull();
    expect(screen.queryByText('served-model')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
    await act(async () =>
      resolve({ logs: [log({ servedModel: 'replacement-model' })], nextBefore: null }),
    );
    expect(await screen.findByRole('button', { expanded: false })).toHaveTextContent(
      'replacement-model',
    );
    expect(screen.queryByText('Model answered')).toBeNull();
  });

  it('says so when there are no requests, and offers a retry on failure', async () => {
    const fetchLogs = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ logs: [], nextBefore: null });
    render(<RequestLogsPanel fetchLogs={fetchLogs} />, { wrapper });
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No API requests yet/)).toBeInTheDocument();
  });
});
