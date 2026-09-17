import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConnectorCallLog } from '../ConnectorCallLog';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const CALLS = [
  {
    connectorId: 'github',
    toolName: 'create_issue',
    outcome: 'succeeded',
    durationMs: 412,
    occurredAt: '2026-09-17T10:00:00.000Z',
  },
  {
    connectorId: 'github',
    toolName: 'list_repos',
    outcome: 'failed',
    durationMs: null,
    occurredAt: '2026-09-17T09:00:00.000Z',
  },
  {
    connectorId: 'github',
    toolName: 'delete_repo',
    outcome: 'blocked',
    durationMs: 2500,
    occurredAt: '2026-09-17T08:00:00.000Z',
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe('ConnectorCallLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<ConnectorCallLog connectorId="github" />);

    expect(screen.getByText('Reading the call log')).toBeInTheDocument();
  });

  it('asks only for the connector it is showing', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ calls: CALLS }));
    render(<ConnectorCallLog connectorId="github" />);

    await screen.findByText('create_issue');
    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain(
      '/api/connectors/calls?connectorId=github',
    );
  });

  it('names each call, what it did and whether it answered', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ calls: CALLS }));
    render(<ConnectorCallLog connectorId="github" />);

    const list = await screen.findByRole('list');
    expect(within(list).getByText('Worked')).toBeInTheDocument();
    expect(within(list).getByText('Failed')).toBeInTheDocument();
    expect(within(list).getByText('Blocked here')).toBeInTheDocument();
    expect(within(list).getByText(/412 ms/)).toBeInTheDocument();
    expect(within(list).getByText(/2\.5 s/)).toBeInTheDocument();
  });

  it('explains that a run of failures is what marks the connector not responding', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ calls: CALLS }));
    render(<ConnectorCallLog connectorId="github" />);

    await screen.findByText('create_issue');
    expect(screen.getByText(/marks it as not responding/)).toBeInTheDocument();
  });

  it('says an unused connector has nothing to show, rather than staying blank', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ calls: [] }));
    render(<ConnectorCallLog connectorId="github" />);

    expect(await screen.findByText(/has not been called yet/)).toBeInTheDocument();
  });

  it('offers a retry when the log could not be read', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ error: { message: 'Denied' } }, 403));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ calls: CALLS }));
    render(<ConnectorCallLog connectorId="github" />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('create_issue')).toBeInTheDocument());
  });
});
