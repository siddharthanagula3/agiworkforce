import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ConnectorScopeList } from '../ConnectorScopeList';

describe('ConnectorScopeList', () => {
  it('lists each scope with a plain sentence and a Read or Write badge', () => {
    render(<ConnectorScopeList connectorId="gmail" />);

    expect(screen.getByText('Permissions requested')).toBeVisible();
    expect(screen.getByText('Reads your Gmail messages and attachments.')).toBeVisible();
    expect(screen.getByText('Sends email from your Gmail account.')).toBeVisible();

    const badges = screen.getAllByText(/^(Read|Write)$/);
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Write').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
  });

  it('says a scope-less OAuth provider does not use scopes', () => {
    render(<ConnectorScopeList connectorId="notion" />);

    expect(screen.getByText(/does not use OAuth scopes/)).toBeVisible();
    expect(screen.queryByText('Permissions requested')).toBeNull();
  });

  it('says an unreviewed provider has not been reviewed yet', () => {
    render(<ConnectorScopeList connectorId="calendly" />);

    expect(screen.getByText(/have not been reviewed yet/)).toBeVisible();
  });

  it('renders nothing for a connector with no scope ceiling at all', () => {
    const { container } = render(<ConnectorScopeList connectorId="github" />);

    expect(container).toBeEmptyDOMElement();
  });
});
