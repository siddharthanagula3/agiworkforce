import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const setupRequirements = vi.hoisted(() => ({
  current: {} as Record<string, { kind: string; missingEnv: string[]; message: string }>,
}));

vi.mock('../../hooks/use-connectors', () => ({
  useConnectors: () => ({ setupRequirements: setupRequirements.current }),
}));

import { ConnectorSetupNotice } from '../ConnectorSetupNotice';

describe('ConnectorSetupNotice', () => {
  it('names the env pair the deployment is missing, values never', () => {
    setupRequirements.current = {
      gmail: {
        kind: 'oauth-client-pair',
        missingEnv: ['CONNECTOR_OAUTH_GMAIL_CLIENT_ID', 'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET'],
        message:
          'Gmail needs CONNECTOR_OAUTH_GMAIL_CLIENT_ID and CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET on this deployment.',
      },
    };

    render(<ConnectorSetupNotice connectorId="gmail" />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Gmail needs CONNECTOR_OAUTH_GMAIL_CLIENT_ID and CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET on this deployment.',
    );
  });

  it('renders nothing for a connector that needs no setup', () => {
    setupRequirements.current = {};

    const { container } = render(<ConnectorSetupNotice connectorId="notion" />);

    expect(container).toBeEmptyDOMElement();
  });
});
