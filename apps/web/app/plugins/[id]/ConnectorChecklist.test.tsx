import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useConnectorsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/connectors/hooks/use-connectors', () => ({
  useConnectors: useConnectorsMock,
}));
vi.mock('@/features/connectors/components/OfficialConnectorLogo', () => ({
  OfficialConnectorLogo: () => <div />,
}));

import { ConnectorChecklist } from './ConnectorChecklist';

function status(overrides: Record<string, unknown> = {}) {
  return { connectedIds: new Set<string>(), loading: false, error: null, ...overrides };
}

beforeEach(() => {
  useConnectorsMock.mockReset();
});

describe('ConnectorChecklist', () => {
  it('says the connection status is unknown rather than showing every connector as missing', () => {
    useConnectorsMock.mockReturnValue(status({ error: 'network down' }));

    render(<ConnectorChecklist connectorIds={['github']} />);

    expect(screen.getByRole('status')).toHaveTextContent(/could not be read/i);
  });

  it('claims nothing while the read is still in flight', () => {
    useConnectorsMock.mockReturnValue(status({ loading: true }));

    render(<ConnectorChecklist connectorIds={['github']} />);

    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect' })).not.toBeInTheDocument();
  });

  it('reports a connected connector without the unreadable notice', () => {
    useConnectorsMock.mockReturnValue(status({ connectedIds: new Set(['github']) }));

    render(<ConnectorChecklist connectorIds={['github']} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so plainly when the pack needs no connector', () => {
    useConnectorsMock.mockReturnValue(status());

    render(<ConnectorChecklist connectorIds={[]} />);

    expect(screen.getByText(/does not require any connectors/i)).toBeInTheDocument();
  });
});
