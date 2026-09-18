import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  reconnect: vi.fn(),
  status: {
    needsReauthorizationIds: new Set<string>(),
    notRespondingIds: new Set<string>(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

vi.mock('../../hooks/use-connectors', () => ({
  connectorDisplayName: (id: string) => (id === 'gmail' ? 'Gmail' : id),
  useConnectors: () => ({
    needsReauthorizationIds: mocks.status.needsReauthorizationIds,
    notRespondingIds: mocks.status.notRespondingIds,
    reconnect: mocks.reconnect,
  }),
}));

import { ConnectorOutcomeAnnouncer } from '../ConnectorOutcomeAnnouncer';

beforeEach(() => {
  mocks.toastError.mockReset();
  mocks.reconnect.mockReset();
  mocks.status.needsReauthorizationIds = new Set();
  mocks.status.notRespondingIds = new Set();
});

describe('ConnectorOutcomeAnnouncer', () => {
  it('announces an expired grant as a reconnect state, never as an empty result', async () => {
    mocks.status.needsReauthorizationIds = new Set(['gmail']);

    render(<ConnectorOutcomeAnnouncer />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    const [message, options] = mocks.toastError.mock.calls[0] ?? [];
    expect(String(message)).toContain('Gmail');
    expect(String(message)).toContain('Reconnect');
    expect(String(message).toLowerCase()).not.toContain('no results');
    expect(options?.action?.label).toBe('Reconnect');

    options?.action?.onClick();
    expect(mocks.reconnect).toHaveBeenCalledWith('gmail');
  });

  it('announces a connector that stopped answering without offering a reconnect', async () => {
    mocks.status.notRespondingIds = new Set(['gmail']);

    render(<ConnectorOutcomeAnnouncer />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    const [message, options] = mocks.toastError.mock.calls[0] ?? [];
    expect(String(message)).toContain('did not answer');
    expect(String(message).toLowerCase()).not.toContain('no results');
    expect(options).toBeUndefined();
  });

  it('says nothing when every connector is healthy', () => {
    render(<ConnectorOutcomeAnnouncer />);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
