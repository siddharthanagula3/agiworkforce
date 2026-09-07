import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  rowByServerId: vi.fn(),
  targetByUrl: vi.fn(),
  credentialSpec: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorOAuthStoreUnavailableError: class extends Error {},
  createPendingAuthorization: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/mcp-discovery', () => ({ beginMcpAuthorization: vi.fn() }));
vi.mock('@/lib/connectors/mcp-directory-targets', () => ({
  resolveDirectoryTarget: vi.fn(async () => null),
  findDirectoryTargetByRemoteUrl: (...a: unknown[]) => mocks.targetByUrl(...a),
}));
vi.mock('@/lib/connectors/mcp-credential-spec', () => ({
  resolveConnectorCredentialSpec: (...a: unknown[]) => mocks.credentialSpec(...a),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  findUserCustomConnectorByServerId: (...a: unknown[]) => mocks.rowByServerId(...a),
}));

import { GET, OAUTH_START_STATUS_CREDENTIAL } from './route';

const SERVER_ID = 'custom-abc123def0';
const DIRECTORY_ID = 'io.sentry/mcp';

function request(query: string): NextRequest {
  return new NextRequest(`https://app.example.com/api/connectors/oauth/start${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.rowByServerId.mockResolvedValue({
    id: 'row-1',
    shortId: 'abc123def0',
    connectorId: SERVER_ID,
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    transport: 'streamable-http',
  });
  mocks.targetByUrl.mockResolvedValue({ connectorId: DIRECTORY_ID, name: 'Sentry' });
  mocks.credentialSpec.mockResolvedValue({ placement: 'header', headerName: 'Authorization' });
});

describe('GET /api/connectors/oauth/start, API-key reconnect', () => {
  it('sends a browser to the connector detail where the key form lives', async () => {
    const response = await GET(request(`?connectorId=${SERVER_ID}`));

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/connectors');
    expect(location).toContain(encodeURIComponent(DIRECTORY_ID));
    expect(mocks.rowByServerId).toHaveBeenCalledWith('user-1', SERVER_ID);
  });

  it('answers a json caller with the settings target and the credentials path', async () => {
    const response = await GET(request(`?mode=json&connectorId=${SERVER_ID}`));
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(200);
    expect(body['status']).toBe(OAUTH_START_STATUS_CREDENTIAL);
    expect(body['connectorName']).toBe('Sentry');
    expect(body['credentialsPath']).toBe(
      `/api/connectors/${encodeURIComponent(DIRECTORY_ID)}/credentials`,
    );
    expect(body['settingsHref']).toContain(encodeURIComponent(DIRECTORY_ID));
  });

  it('never resolves a row for a caller who does not own it', async () => {
    mocks.rowByServerId.mockResolvedValue(null);

    const response = await GET(request(`?mode=json&connectorId=${SERVER_ID}`));

    expect(response.status).not.toBe(200);
    expect(mocks.targetByUrl).not.toHaveBeenCalled();
  });

  it('leaves a hand-entered endpoint on the ordinary not-configured path', async () => {
    mocks.targetByUrl.mockResolvedValue(null);

    const response = await GET(request(`?mode=json&connectorId=${SERVER_ID}`));

    expect(response.status).toBe(501);
    expect(mocks.credentialSpec).not.toHaveBeenCalled();
  });

  it('does not claim a key form for a server that wants the credential elsewhere', async () => {
    mocks.credentialSpec.mockResolvedValue({ placement: 'query', headerName: 'Authorization' });

    const response = await GET(request(`?mode=json&connectorId=${SERVER_ID}`));

    expect(response.status).toBe(501);
  });

  it('leaves every non-custom connector id untouched', async () => {
    mocks.rowByServerId.mockResolvedValue(null);

    await GET(request('?mode=json&connectorId=gmail'));

    expect(mocks.targetByUrl).not.toHaveBeenCalled();
    expect(mocks.credentialSpec).not.toHaveBeenCalled();
  });
});
