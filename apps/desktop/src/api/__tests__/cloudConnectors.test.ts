import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  assertManagedCloudBoundary: vi.fn(),
}));

vi.mock('../cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.agi.example',
}));

vi.mock('../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
}));

import { createCustomConnector } from '../cloudConnectors';

describe('cloudConnectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthHeaders.mockResolvedValue({
      Authorization: 'Bearer desktop-session',
      'Content-Type': 'application/json',
    });
    mocks.createManagedCloudRequestContext.mockReturnValue({
      fetch: mocks.cloudFetch,
      getHeaders: mocks.getAuthHeaders,
      assertBoundary: mocks.assertManagedCloudBoundary,
    });
    mocks.cloudFetch.mockResolvedValue(new Response(null, { status: 201 }));
  });

  it('forwards an optional custom-connector bearer token to the encrypted Cloud endpoint', async () => {
    await createCustomConnector({
      name: 'Private MCP',
      url: 'https://mcp.example.com',
      authToken: '  secret-token  ',
    });

    expect(mocks.cloudFetch).toHaveBeenCalledWith(
      'https://cloud.agi.example/api/connectors/custom',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer desktop-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Private MCP',
          url: 'https://mcp.example.com',
          authToken: 'secret-token',
        }),
      },
    );
    expect(mocks.assertManagedCloudBoundary).toHaveBeenCalledOnce();
  });

  it('does not invent an auth token when the custom connector has no credential', async () => {
    await createCustomConnector({
      name: 'Public MCP',
      url: 'https://public-mcp.example.com',
    });

    const request = mocks.cloudFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      name: 'Public MCP',
      url: 'https://public-mcp.example.com',
    });
  });
});
