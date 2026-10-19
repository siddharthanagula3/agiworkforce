import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DeveloperRequestLog } from '@agiworkforce/cloud-contracts';

vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { RequestLogsPanel } from '../components/RequestLogsPanel';

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
    render(<RequestLogsPanel fetchLogs={fetchLogs} />);
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
    render(<RequestLogsPanel fetchLogs={fetchLogs} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show older' }));
    expect(await screen.findByText('older-model')).toBeInTheDocument();
    expect(fetchLogs).toHaveBeenLastCalledWith('2026-10-19T10:00:00.000Z');
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();
  });

  it('says so when there are no requests, and offers a retry on failure', async () => {
    const fetchLogs = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ logs: [], nextBefore: null });
    render(<RequestLogsPanel fetchLogs={fetchLogs} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No API requests yet/)).toBeInTheDocument();
  });
});
