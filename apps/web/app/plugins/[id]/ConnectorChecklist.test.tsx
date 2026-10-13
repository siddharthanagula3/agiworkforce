import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
} from '@agiworkforce/types';

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

describe('ConnectorChecklist once connectors are released', () => {
  it('says the connection status is unknown rather than showing every connector as missing', () => {
    useConnectorsMock.mockReturnValue(status({ error: 'network down' }));

    render(<ConnectorChecklist connectorIds={['github']} releaseState="released" />);

    expect(screen.getByRole('status')).toHaveTextContent(/could not be read/i);
  });

  it('claims nothing while the read is still in flight', () => {
    useConnectorsMock.mockReturnValue(status({ loading: true }));

    render(<ConnectorChecklist connectorIds={['github']} releaseState="released" />);

    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect' })).not.toBeInTheDocument();
  });

  it('reports a connected connector without the unreadable notice', () => {
    useConnectorsMock.mockReturnValue(status({ connectedIds: new Set(['github']) }));

    render(<ConnectorChecklist connectorIds={['github']} releaseState="released" />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers Connect for a connector the account has not connected', () => {
    useConnectorsMock.mockReturnValue(status());

    render(<ConnectorChecklist connectorIds={['github']} releaseState="released" />);

    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/connectors');
    expect(screen.queryByText(CONNECTORS_COMING_SOON_LABEL)).not.toBeInTheDocument();
  });
});

describe('ConnectorChecklist while connectors are unreleased', () => {
  it('shows the release status in place of a Connect link that could not connect anything', () => {
    render(<ConnectorChecklist connectorIds={['github', 'slack']} releaseState="coming_soon" />);

    expect(screen.getByText(CONNECTORS_COMING_SOON_MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByText(CONNECTORS_COMING_SOON_LABEL)).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Connect' })).not.toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });

  it('does not ask the server for connections it would refuse to list', () => {
    render(<ConnectorChecklist connectorIds={['github']} releaseState="coming_soon" />);

    expect(useConnectorsMock).not.toHaveBeenCalled();
  });
});

describe('ConnectorChecklist release switch', () => {
  it('follows the connector release registry when no state is passed', () => {
    useConnectorsMock.mockReturnValue(status());

    render(<ConnectorChecklist connectorIds={['github']} />);

    const connectLink = screen.queryByRole('link', { name: 'Connect' });
    if (connectorsReleased()) {
      expect(connectLink).toBeInTheDocument();
    } else {
      expect(connectLink).not.toBeInTheDocument();
      expect(screen.getByText(CONNECTORS_COMING_SOON_LABEL)).toBeInTheDocument();
    }
  });

  it.each(['released', 'coming_soon'] as const)(
    'says so plainly when the pack needs no connector (%s)',
    (releaseState) => {
      useConnectorsMock.mockReturnValue(status());

      render(<ConnectorChecklist connectorIds={[]} releaseState={releaseState} />);

      expect(screen.getByText(/does not require any connectors/i)).toBeInTheDocument();
    },
  );
});
