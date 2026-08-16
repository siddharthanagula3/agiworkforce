const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import {
  connectConnector,
  fetchConnectorDirectory,
  startConnectorOAuth,
} from '../services/connectors';

function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

beforeEach(() => jest.clearAllMocks());

describe('connectConnector', () => {
  it('reports connected only when the server actually wrote the enablement row', async () => {
    mockPost.mockResolvedValue({ connector: { id: 'row-1' } });

    await expect(connectConnector('slack')).resolves.toEqual({ kind: 'connected' });
    expect(mockPost).toHaveBeenCalledWith('/api/connectors', { connectorId: 'slack' });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('turns the OAuth 409 into an authorization handoff instead of an error', async () => {
    mockPost.mockRejectedValue(
      httpError(
        'This connector connects through OAuth authorization, not a directory toggle.',
        409,
      ),
    );
    mockGet.mockResolvedValue({
      connectorId: 'linear',
      authorizeUrl: 'https://linear.app/oauth/authorize?client_id=abc&state=xyz',
    });

    await expect(connectConnector('linear')).resolves.toEqual({
      kind: 'oauth-required',
      connectorId: 'linear',
      authorizeUrl: 'https://linear.app/oauth/authorize?client_id=abc&state=xyz',
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/api/connectors/oauth/start?connectorId=linear&mode=json',
    );
  });

  it('surfaces the server message when no OAuth app is configured for the provider', async () => {
    mockPost.mockRejectedValue(httpError('needs oauth', 409));
    mockGet.mockRejectedValue(
      httpError('This connector has no OAuth application configured in this deployment.', 501),
    );

    await expect(connectConnector('linear')).rejects.toThrow(
      'This connector has no OAuth application configured in this deployment.',
    );
  });

  it('rethrows a non-409 failure rather than starting an authorization', async () => {
    mockPost.mockRejectedValue(httpError('Connector authorization is not implemented', 501));

    await expect(connectConnector('notion')).rejects.toThrow(
      'Connector authorization is not implemented',
    );
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('startConnectorOAuth', () => {
  it('refuses an authorize URL that is not credential-free https', async () => {
    mockGet.mockResolvedValue({
      connectorId: 'linear',
      authorizeUrl: 'http://linear.app/oauth/authorize',
    });
    await expect(startConnectorOAuth('linear')).rejects.toThrow(
      'Invalid connector authorization response',
    );

    mockGet.mockResolvedValue({
      connectorId: 'linear',
      authorizeUrl: 'https://user:pass@linear.app/oauth/authorize',
    });
    await expect(startConnectorOAuth('linear')).rejects.toThrow(
      'Invalid connector authorization response',
    );
  });

  it('refuses a response for a different connector than the one requested', async () => {
    mockGet.mockResolvedValue({
      connectorId: 'attacker',
      authorizeUrl: 'https://attacker.example.com/authorize',
    });

    await expect(startConnectorOAuth('linear')).rejects.toThrow(
      'Invalid connector authorization response',
    );
  });
});

describe('fetchConnectorDirectory with OAuth grants', () => {
  it('parses a source: oauth grant with its granted scopes and reauthorization flag', async () => {
    mockGet.mockResolvedValue({
      connectors: [
        {
          id: 'oauth-linear',
          connectorId: 'linear',
          authType: 'oauth',
          connectedAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          source: 'oauth',
          scopes: ['read', 'write'],
          needsReauthorization: true,
        },
      ],
      available: ['linear'],
    });

    await expect(fetchConnectorDirectory()).resolves.toEqual({
      connectors: [
        {
          id: 'oauth-linear',
          connectorId: 'linear',
          authType: 'oauth',
          connectedAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          source: 'oauth',
          scopes: ['read', 'write'],
          needsReauthorization: true,
        },
      ],
      available: ['linear'],
    });
  });

  it('still rejects an unknown source or a malformed scopes list', async () => {
    mockGet.mockResolvedValue({
      connectors: [
        {
          id: 'x',
          connectorId: 'linear',
          authType: 'oauth',
          connectedAt: '',
          updatedAt: '',
          source: 'platform',
        },
      ],
      available: [],
    });
    await expect(fetchConnectorDirectory()).rejects.toThrow('Invalid connectors response');

    mockGet.mockResolvedValue({
      connectors: [
        {
          id: 'x',
          connectorId: 'linear',
          authType: 'oauth',
          connectedAt: '',
          updatedAt: '',
          source: 'oauth',
          scopes: [{ scope: 'read' }],
        },
      ],
      available: [],
    });
    await expect(fetchConnectorDirectory()).rejects.toThrow('Invalid connectors response');
  });
});
