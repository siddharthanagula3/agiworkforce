import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);

import { ConnectorConnectCard } from '../ConnectorConnectCard';
import type { ConnectorConnectRequest } from '../../lib/connector-connect-required';

function request(overrides: Partial<ConnectorConnectRequest> = {}): ConnectorConnectRequest {
  return {
    connectorId: 'linear',
    connectorName: 'Linear',
    toolName: 'search_issues',
    qualifiedToolName: 'mcp__linear__search_issues',
    reason: 'not_connected',
    connectUrl: '/api/connectors/oauth/start?connectorId=linear',
    scopes: ['read', 'write:issues'],
    ...overrides,
  };
}

describe('ConnectorConnectCard · connectable provider', () => {
  it('names the connector, the tool that needs it, and the scopes requested', () => {
    render(<ConnectorConnectCard request={request()} />);

    expect(screen.getByRole('group', { name: 'Connect Linear' })).toBeTruthy();
    expect(screen.getByText('mcp__linear__search_issues')).toBeTruthy();
    expect(screen.getByText(/Linear · search_issues/)).toBeTruthy();
    expect(screen.getByText('read')).toBeTruthy();
    expect(screen.getByText('write:issues')).toBeTruthy();
  });

  it('points Connect at the envelope connectUrl and returns the user to this conversation', () => {
    window.history.pushState({}, '', '/chat/abc?x=1');
    render(<ConnectorConnectCard request={request()} />);

    const href = screen.getByTestId('connector-connect-link').getAttribute('href') ?? '';
    expect(href).toBe(
      '/api/connectors/oauth/start?connectorId=linear&returnPath=%2Fchat%2Fabc%3Fx%3D1',
    );
  });

  it('labels a re-authorization as Reconnect', () => {
    render(<ConnectorConnectCard request={request({ reason: 'authorization_expired' })} />);
    expect(screen.getByRole('group', { name: 'Reconnect Linear' })).toBeTruthy();
    expect(screen.getByTestId('connector-connect-link').textContent).toContain('Reconnect Linear');
  });

  it('says plainly that connecting does not resume the turn, and Retry re-runs it', () => {
    const onRetryTurn = vi.fn();
    render(<ConnectorConnectCard request={request()} onRetryTurn={onRetryTurn} />);

    expect(screen.getByText(/does not resume this turn/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('connector-connect-retry'));
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
  });

  it('hides Retry when the surface has no regenerate wiring rather than rendering a dead button', () => {
    render(<ConnectorConnectCard request={request()} />);
    expect(screen.queryByTestId('connector-connect-retry')).toBeNull();
  });

  it('collapses a long scope list instead of flooding the card', () => {
    const scopes = Array.from({ length: 12 }, (_, i) => `scope-${i}`);
    render(<ConnectorConnectCard request={request({ scopes })} />);

    expect(screen.getByText('scope-7')).toBeTruthy();
    expect(screen.queryByText('scope-8')).toBeNull();
    expect(screen.getByText('+4 more')).toBeTruthy();
  });
});

describe('ConnectorConnectCard · unconfigured provider (the honest default today)', () => {
  const unavailable = request({ connectUrl: null, scopes: [] });

  it('offers no Connect button and says the deployment cannot connect it', () => {
    render(<ConnectorConnectCard request={unavailable} />);

    expect(screen.queryByTestId('connector-connect-link')).toBeNull();
    expect(screen.getByText(/can’t be connected here/)).toBeTruthy();
    expect(screen.getByText(/no Linear authorization app configured/)).toBeTruthy();
  });

  it('offers no Retry either, re-running cannot fix missing configuration', () => {
    render(<ConnectorConnectCard request={unavailable} onRetryTurn={vi.fn()} />);
    expect(screen.queryByTestId('connector-connect-retry')).toBeNull();
  });
});

describe('ConnectorConnectCard · untrusted display data', () => {
  it('renders connector names and scopes as text, never as markup', () => {
    const { container } = render(
      <ConnectorConnectCard
        request={request({
          connectorName: '<img src=x onerror="alert(1)">Evil',
          scopes: ['<script>alert(1)</script>', '<b>bold</b>'],
        })}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.getByText('<b>bold</b>')).toBeTruthy();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">Evil');
  });
});
