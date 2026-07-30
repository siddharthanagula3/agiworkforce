/**
 * addCustomConnector reuses the web `/api/connectors/custom` route so a user can
 * add a remote-MCP connector with no OAuth app registration; isLikelyHttpsUrl is
 * the composer-side pre-check before the (authoritative) server validation.
 */
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

import {
  addCustomConnector,
  fetchConnectorDirectory,
  fetchConnectorToolPermissions,
  getGitHubInstallWebUrl,
  resetConnectorToolPermission,
  setConnectorToolPermission,
} from '../services/connectors';
import { isLikelyHttpsUrl } from '../src/features/settings/cloud-connectors/AddCustomConnectorModal';

beforeEach(() => jest.clearAllMocks());

describe('addCustomConnector', () => {
  it('POSTs trimmed name/url (and optional auth token) to /api/connectors/custom', async () => {
    mockPost.mockResolvedValue({
      connector: {
        id: 'row-1',
        shortId: 'ab12',
        name: 'My Tools',
        url: 'https://mcp.example.com/sse',
      },
    });

    const result = await addCustomConnector({
      name: '  My Tools  ',
      url: '  https://mcp.example.com/sse  ',
      authToken: '  secret  ',
    });

    expect(mockPost).toHaveBeenCalledWith('/api/connectors/custom', {
      name: 'My Tools',
      url: 'https://mcp.example.com/sse',
      authToken: 'secret',
    });
    expect(result.shortId).toBe('ab12');
  });

  it('omits an empty auth token', async () => {
    mockPost.mockResolvedValue({
      connector: { id: 'r', shortId: 's', name: 'n', url: 'https://x.y' },
    });
    await addCustomConnector({ name: 'n', url: 'https://x.y', authToken: '   ' });
    expect(mockPost).toHaveBeenCalledWith('/api/connectors/custom', {
      name: 'n',
      url: 'https://x.y',
    });
  });
});

describe('getGitHubInstallWebUrl', () => {
  it('points at the vetted web GitHub-App install-start flow', () => {
    expect(getGitHubInstallWebUrl()).toMatch(/^https:\/\/.+\/api\/github\/install\/start$/);
  });
});

describe('fetchConnectorDirectory', () => {
  it('preserves real availability and custom-connector identity from the server', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValue({
      connectors: [
        {
          id: 'row-1',
          connectorId: 'slack',
          authType: 'oauth',
          connectedAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          source: 'user',
        },
        {
          id: 'custom-row-1',
          connectorId: 'custom-ab12',
          authType: 'custom_mcp',
          connectedAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          source: 'custom',
          name: 'Internal tools',
        },
      ],
      available: ['slack', 'github'],
    });

    await expect(fetchConnectorDirectory()).resolves.toEqual({
      connectors: expect.arrayContaining([
        expect.objectContaining({ connectorId: 'custom-ab12', name: 'Internal tools' }),
      ]),
      available: ['slack', 'github'],
    });
  });

  it('rejects malformed responses instead of rendering fake availability', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValue({ connectors: [], available: 'everything' });

    await expect(fetchConnectorDirectory()).rejects.toThrow('Invalid connectors response');
  });
});

describe('connector tool permissions', () => {
  it('accepts only saved wire-level tool decisions', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValue({
      permissions: [
        { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
        { connectorId: 'custom-ab12', toolName: 'deploy_preview', level: 'deny' },
      ],
    });

    await expect(fetchConnectorToolPermissions()).resolves.toEqual([
      { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
      { connectorId: 'custom-ab12', toolName: 'deploy_preview', level: 'deny' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/api/connectors/permissions');
  });

  it('rejects display-label or malformed permission responses', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValue({
      permissions: [{ connectorId: 'github', toolName: 'Create issue', level: 'sometimes' }],
    });

    await expect(fetchConnectorToolPermissions()).rejects.toThrow(
      'Invalid connector permissions response',
    );
  });

  it('persists and resets exact connector/tool keys through the server API', async () => {
    const mockDelete = jest.requireMock('../services/api').api.delete as jest.Mock;
    mockPut.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });

    await setConnectorToolPermission('custom-ab12', 'deploy preview', 'deny');
    await resetConnectorToolPermission('custom-ab12', 'deploy preview');

    expect(mockPut).toHaveBeenCalledWith('/api/connectors/permissions', {
      connectorId: 'custom-ab12',
      toolName: 'deploy preview',
      level: 'deny',
    });
    expect(mockDelete).toHaveBeenCalledWith(
      '/api/connectors/permissions?connectorId=custom-ab12&toolName=deploy%20preview',
    );
  });
});

describe('isLikelyHttpsUrl', () => {
  it('accepts https URLs', () => {
    expect(isLikelyHttpsUrl('https://mcp.example.com/sse')).toBe(true);
    expect(isLikelyHttpsUrl('  https://a.b/c  ')).toBe(true);
  });

  it('rejects non-https / malformed URLs', () => {
    expect(isLikelyHttpsUrl('http://insecure.example.com')).toBe(false);
    expect(isLikelyHttpsUrl('mcp.example.com')).toBe(false);
    expect(isLikelyHttpsUrl('https://')).toBe(false);
    expect(isLikelyHttpsUrl('')).toBe(false);
  });
});
