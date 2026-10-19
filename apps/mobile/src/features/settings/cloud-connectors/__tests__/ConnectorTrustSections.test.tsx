import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { ConnectorConsentNotes, ConnectorHealthCard } from '../ConnectorTrustSections';

const HEALTH = {
  connectorId: 'gmail-tools',
  state: 'not-responding',
  calls: 4,
  meteredCalls: 4,
  failures: 4,
  blocked: 0,
  failureRatio: 1,
  consecutiveFailures: 4,
  p50LatencyMs: 1500,
  p95LatencyMs: 3000,
  lastOutcome: 'failed',
  lastCallAt: '2026-10-01T00:00:00.000Z',
  circuit: 'open',
  retryAfterMs: 30000,
};

describe('connector trust sections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports this connector’s measured health and checks again on demand', async () => {
    mockGet.mockResolvedValue({ connectors: [{ ...HEALTH, connectorId: 'slack' }, HEALTH] });
    const { findByText, getByText } = render(
      <ConnectorHealthCard connectorIds={['gmail', 'gmail-tools']} />,
    );
    expect(await findByText('Not responding')).toBeTruthy();
    expect(getByText('4 calls, 4 failed, typically 1.5 s')).toBeTruthy();
    expect(
      getByText('Paused after 4 failures in a row. The next call is allowed in 30s.'),
    ).toBeTruthy();
    fireEvent.press(getByText('Check again'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenCalledWith('/api/connectors/health', expect.anything());
  });

  it('says when there is nothing to measure', async () => {
    mockGet.mockResolvedValue({ connectors: [] });
    const { findByText } = render(<ConnectorHealthCard connectorIds={['gmail']} />);
    expect(
      await findByText('Not called in the last hour, so there is nothing to measure yet.'),
    ).toBeTruthy();
  });

  it('explains how long what a connector fetches is kept', () => {
    const { getByText } = render(<ConnectorConsentNotes />);
    expect(getByText('What it fetches stays with the chat')).toBeTruthy();
    expect(getByText(/follows that chat’s retention/)).toBeTruthy();
  });
});
