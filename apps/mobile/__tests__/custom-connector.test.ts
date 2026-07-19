/**
 * addCustomConnector reuses the web `/api/connectors/custom` route so a user can
 * add a remote-MCP connector with no OAuth app registration; isLikelyHttpsUrl is
 * the composer-side pre-check before the (authoritative) server validation.
 */
const mockPost = jest.fn();
jest.mock('../services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

import { addCustomConnector } from '../services/connectors';
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
