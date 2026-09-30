const mockPost = jest.fn();
const mockOpenAuthSession = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

import { authorizeConnectorInApp, completeConnectorAuthorization } from '../services/connectors';

const STATE = 'b'.repeat(64);

describe('a connector sign-in that returns to the app', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockOpenAuthSession.mockReset();
  });

  it('finishes the sign-in over the signed-in session with what the provider returned', async () => {
    mockPost.mockResolvedValue({ connectorId: 'linear', status: 'connected' });

    const status = await completeConnectorAuthorization(
      `agiworkforce://connectors/oauth?state=${STATE}&code=auth-code&iss=https%3A%2F%2Fauth.example.com`,
    );

    expect(status).toBe('connected');
    expect(mockPost).toHaveBeenCalledWith('/api/connectors/oauth/complete', {
      state: STATE,
      code: 'auth-code',
      iss: 'https://auth.example.com',
    });
  });

  it('does not call the server for a return that names no sign-in', async () => {
    await expect(
      completeConnectorAuthorization('agiworkforce://connectors/oauth?code=x'),
    ).resolves.toBe('invalid_state');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('opens the provider in an auth session that returns to the app', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `agiworkforce://connectors/oauth?state=${STATE}&error=access_denied`,
    });
    mockPost.mockResolvedValue({ connectorId: 'linear', status: 'denied' });

    const status = await authorizeConnectorInApp('https://auth.example.com/authorize?state=x');

    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      'https://auth.example.com/authorize?state=x',
      'agiworkforce://connectors/oauth',
    );
    expect(status).toBe('denied');
  });

  it('reports a closed sign-in without finishing anything', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(authorizeConnectorInApp('https://auth.example.com/authorize')).resolves.toBe(
      'dismissed',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});
