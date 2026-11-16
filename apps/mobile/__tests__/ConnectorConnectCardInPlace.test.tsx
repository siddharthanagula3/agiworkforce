/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ConnectorConnectRequest } from '@agiworkforce/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockConnect = jest.fn();
const mockStartOAuth = jest.fn();
const mockAuthorize = jest.fn();
const mockDirectory = jest.fn();
jest.mock('@/services/connectors', () => ({
  connectConnector: (id: string) => mockConnect(id),
  startConnectorOAuth: (id: string) => mockStartOAuth(id),
  authorizeConnectorInApp: (url: string) => mockAuthorize(url),
  fetchConnectorDirectory: () => mockDirectory(),
}));
const mockAskConsent = jest.fn();
jest.mock('@/src/features/settings/cloud-connectors/connectorConsent', () => ({
  askConnectorConsent: (target: unknown) => mockAskConsent(target),
}));
const mockOpenBrowser = jest.fn();
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (url: string) => mockOpenBrowser(url),
}));
jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});
jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

import { ConnectorConnectCard } from '@/src/features/chat/components/ConnectorConnectCard';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize?state=abc';

function connectRequest(overrides: Partial<ConnectorConnectRequest> = {}): ConnectorConnectRequest {
  return {
    reason: 'not_connected',
    connectorId: 'github',
    connectorName: 'GitHub',
    toolName: 'create_issue',
    qualifiedToolName: 'mcp__github__create_issue',
    connectUrl: '/api/connectors/oauth/start?connectorId=github',
    scopes: ['repo', 'read:user'],
    ...overrides,
  } as ConnectorConnectRequest;
}

describe('ConnectorConnectCard in a chat', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockPush.mockReset();
    mockConnect.mockReset();
    mockStartOAuth.mockReset();
    mockAuthorize.mockReset();
    mockDirectory.mockReset();
    mockOpenBrowser.mockReset();
    mockAskConsent.mockReset();
    mockAskConsent.mockResolvedValue(true);
  });

  it('asks before a first connect and starts nothing when the person denies', async () => {
    mockAskConsent.mockResolvedValue(false);
    const view = render(<ConnectorConnectCard request={connectRequest()} />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Connect GitHub'));
    });
    expect(mockAskConsent).toHaveBeenCalledWith({
      id: 'github',
      name: 'GitHub',
      providerSignIn: true,
    });
    expect(mockConnect).not.toHaveBeenCalled();
    expect(view.getByText('Connect')).toBeTruthy();
  });

  it('leaves out the provider consent note when the request names no scopes', async () => {
    mockAskConsent.mockResolvedValue(false);
    const view = render(<ConnectorConnectCard request={connectRequest({ scopes: [] })} />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Connect GitHub'));
    });
    expect(mockAskConsent).toHaveBeenCalledWith({
      id: 'github',
      name: 'GitHub',
      providerSignIn: false,
    });
  });

  it('names the requesting tool, the requested scopes and that Retry re-runs the turn', () => {
    const view = render(
      <ConnectorConnectCard request={connectRequest()} onRetryTurn={jest.fn()} />,
    );
    expect(view.getByText('Requested by GitHub · Create Issue')).toBeTruthy();
    expect(view.getByTestId('connector-connect-card.scopes').props.children).toBe(
      'This will request: repo, read:user',
    );
    expect(
      view.getByText(
        'Connecting opens GitHub and brings you back here. It does not resume this turn; use Retry this turn after you return.',
      ),
    ).toBeTruthy();
  });

  it('shows at most eight scopes and counts the rest', () => {
    const scopes = Array.from({ length: 11 }, (_, index) => `scope${index + 1}`);
    const view = render(<ConnectorConnectCard request={connectRequest({ scopes })} />);
    expect(view.getByTestId('connector-connect-card.scopes').props.children).toBe(
      'This will request: scope1, scope2, scope3, scope4, scope5, scope6, scope7, scope8, +3 more',
    );
  });

  it('opens the provider sign-in in place, shows connecting, and stays on the chat when it connects', async () => {
    mockConnect.mockResolvedValue({
      kind: 'oauth-required',
      connectorId: 'github',
      authorizeUrl: AUTHORIZE_URL,
      appReturn: true,
    });
    let finish: (value: string) => void = () => undefined;
    mockAuthorize.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onRetryTurn = jest.fn();
    const view = render(
      <ConnectorConnectCard request={connectRequest()} onRetryTurn={onRetryTurn} />,
    );

    fireEvent.press(view.getByLabelText('Connect GitHub'));
    await waitFor(() => expect(mockAuthorize).toHaveBeenCalledWith(AUTHORIZE_URL));
    expect(view.getByText('Connecting…')).toBeTruthy();
    expect(view.getByLabelText('Connect GitHub').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });

    await act(async () => finish('connected'));
    expect(view.getByText('GitHub is connected')).toBeTruthy();
    expect(view.queryByLabelText('Connect GitHub')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Retry this turn'));
    expect(onRetryTurn).toHaveBeenCalledTimes(1);
  });

  it('reopens the provider sign-in for Reconnect and says why it did not connect', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockStartOAuth.mockResolvedValue({
      connectorId: 'github',
      authorizeUrl: AUTHORIZE_URL,
      appReturn: true,
    });
    mockAuthorize.mockResolvedValue('denied');
    const view = render(
      <ConnectorConnectCard request={connectRequest({ reason: 'authorization_expired' })} />,
    );
    await act(async () => {
      fireEvent.press(view.getByLabelText('Reconnect GitHub'));
    });
    expect(mockStartOAuth).toHaveBeenCalledWith('github');
    expect(mockConnect).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'GitHub was not connected',
      'The authorization was declined. Nothing was connected.',
    );
    expect(view.getByText('Reconnect')).toBeTruthy();
  });

  it('counts a first connect as done when the directory lists it after the double return', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockConnect.mockResolvedValue({
      kind: 'oauth-required',
      connectorId: 'github',
      authorizeUrl: AUTHORIZE_URL,
      appReturn: true,
    });
    mockAuthorize.mockResolvedValue('invalid_state');
    mockDirectory.mockResolvedValue({ connectors: [{ connectorId: 'github' }] });
    const view = render(<ConnectorConnectCard request={connectRequest()} />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Connect GitHub'));
    });
    expect(view.getByText('GitHub is connected')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
  });

  it('sends a key-based connector to its detail screen for the key', async () => {
    mockConnect.mockResolvedValue({
      kind: 'credentials-required',
      connectorId: 'github',
      credentialsPath: '/api/connectors/github/credentials',
    });
    const view = render(<ConnectorConnectCard request={connectRequest()} />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Connect GitHub'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'github' },
    });
  });

  it('offers no Connect when no authorization app is configured', () => {
    const view = render(<ConnectorConnectCard request={connectRequest({ connectUrl: null })} />);
    expect(view.getByText('GitHub can’t be connected here')).toBeTruthy();
    expect(view.queryByLabelText('Connect GitHub')).toBeNull();
    expect(view.getByTestId('connector-connect-card.scopes').props.children).toBe(
      'Would request: repo, read:user',
    );
  });
});
