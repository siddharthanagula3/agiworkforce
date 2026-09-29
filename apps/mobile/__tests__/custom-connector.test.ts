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
  browseConnectorListings,
  fetchConnectorDirectory,
  fetchConnectorListing,
  fetchConnectorToolPermissions,
  resetConnectorToolPermission,
  saveConnectorApiKey,
  setConnectorToolPermission,
} from '../services/connectors';
import { ApiHttpError } from '../services/apiErrors';
import { ConnectorPolicyError, invalidateConnectorPolicy } from '../services/connectors';
import { isLikelyHttpsUrl } from '../src/features/settings/cloud-connectors/AddCustomConnectorModal';

beforeEach(() => {
  jest.clearAllMocks();
  invalidateConnectorPolicy();
});

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

  it('is refused when the workspace does not allow custom endpoints', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    // Once, not for the rest of the file: jest.clearAllMocks() clears calls but
    // keeps an implementation, so a persistent policy would leak into the next test.
    mockGet.mockResolvedValueOnce({
      organizationId: 'org-1',
      configured: true,
      policy: {
        allowedConnectors: [],
        blockedConnectors: [],
        allowCustomConnectors: false,
        allowedPlugins: [],
        blockedPlugins: [],
        allowedMcpHosts: [],
        updatedAt: '2026-09-17T00:00:00.000Z',
      },
    });

    await expect(
      addCustomConnector({ name: 'Internal', url: 'https://mcp.example.com/sse' }),
    ).rejects.toBeInstanceOf(ConnectorPolicyError);
    expect(mockPost).not.toHaveBeenCalled();
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

    await expect(fetchConnectorDirectory()).resolves.toMatchObject({
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

const LISTING = {
  id: 'io.example/notes',
  name: 'Notes',
  publisher: 'Example',
  description: 'Search your notes',
  categories: ['Productivity'],
  remotes: [{ url: 'https://mcp.example.com/mcp', transport: 'streamable-http' }],
  authMode: 'api-key',
  connectable: 'api-key-form',
  toolNames: ['search_notes'],
  repositoryUrl: null,
  version: null,
  sourceRegistry: 'mcp-registry',
  badge: 'registry',
  iconUrl: null,
  monogram: 'N',
  documentationUrl: null,
  iconSource: 'monogram',
  brandSlug: null,
  authorName: null,
  authorUrl: null,
  websiteUrl: null,
  supportUrl: null,
  privacyPolicyUrl: null,
  toolCount: 1,
  connectorUrl: null,
};

describe('connector directory listings', () => {
  it('asks the registry for connectable entries with the search, category and cursor', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValueOnce({
      entries: [LISTING],
      total: 1,
      nextCursor: null,
      categories: ['Productivity'],
      connectableModes: ['connect'],
      stats: {},
    });

    const page = await browseConnectorListings({
      search: '  notes ',
      category: 'Productivity',
      cursor: '100',
    });

    const href = String(mockGet.mock.calls[0]?.[0]);
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(href.startsWith('/api/connectors/directory?')).toBe(true);
    expect(query.get('connectableOnly')).toBe('true');
    expect(query.get('search')).toBe('notes');
    expect(query.get('category')).toBe('Productivity');
    expect(query.get('cursor')).toBe('100');
    expect(page.entries.map((entry) => entry.id)).toEqual(['io.example/notes']);
  });

  it('rejects a malformed directory page instead of rendering an empty list', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValueOnce({ entries: 'none' });

    await expect(browseConnectorListings({})).rejects.toThrow(
      'Invalid connector directory response',
    );
  });

  it('reads one listing and treats a missing one as absent', async () => {
    const mockGet = jest.requireMock('../services/api').api.get as jest.Mock;
    mockGet.mockResolvedValueOnce({ entry: LISTING });
    await expect(fetchConnectorListing('io.example/notes')).resolves.toMatchObject({
      name: 'Notes',
    });
    expect(mockGet).toHaveBeenLastCalledWith('/api/connectors/directory/io.example/notes');

    mockGet.mockRejectedValueOnce(new ApiHttpError('Not found', 404, null));
    await expect(fetchConnectorListing('custom-ab12')).resolves.toBeNull();
  });
});

describe('saveConnectorApiKey', () => {
  it('posts the trimmed key to the path the server named', async () => {
    mockPost.mockResolvedValueOnce({ toolCount: 3 });

    await saveConnectorApiKey('/api/connectors/io.example%2Fnotes/credentials', '  sk-123  ');

    expect(mockPost).toHaveBeenCalledWith('/api/connectors/io.example%2Fnotes/credentials', {
      apiKey: 'sk-123',
    });
  });

  it('rejects a response that does not confirm the saved connection', async () => {
    mockPost.mockResolvedValueOnce({ ok: true });

    await expect(saveConnectorApiKey('/api/connectors/x/credentials', 'k')).rejects.toThrow(
      'Invalid connector key response',
    );
  });
});
