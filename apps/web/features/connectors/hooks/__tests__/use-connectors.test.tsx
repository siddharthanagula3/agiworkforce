import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
const routerPush = vi.hoisted(() => vi.fn());
const clerkUserState = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserState,
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('test-csrf-token'),
}));

import {
  useConnectors,
  useBrokerOutcome,
  invalidateConnectorsCache,
  withConnectorReturnPath,
  currentConnectorReturnPath,
} from '../use-connectors';

function stubLocation(href: string): { current: string } {
  const url = new URL(href);
  const record = { current: url.toString() };
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      get href() {
        return record.current;
      },
      set href(next: string) {
        record.current = next;
      },
      hash: url.hash,
    },
  });
  return record;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

describe('useConnectors, OAuth grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkUserState.isLoaded = true;
    clerkUserState.isSignedIn = true;
    invalidateConnectorsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it('carries source, granted scopes and needsReauthorization from GET /api/connectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          connectors: [
            {
              connectorId: 'linear',
              connectedAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
              source: 'oauth',
              scopes: ['read', 'write:issue'],
              needsReauthorization: false,
            },
            {
              connectorId: 'notion',
              connectedAt: '2026-07-01T00:00:00.000Z',
              source: 'oauth',
              scopes: ['read_content'],
              needsReauthorization: true,
            },
          ],
          available: ['linear', 'notion'],
        }),
      ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sources['linear']).toBe('oauth');
    expect(result.current.grantedScopes['linear']).toEqual(['read', 'write:issue']);
    expect(result.current.needsReauthorizationIds.has('linear')).toBe(false);
    expect(result.current.needsReauthorizationIds.has('notion')).toBe(true);
    expect(result.current.availableIds.has('linear')).toBe(true);
  });

  it('uses App Router navigation for a signed-out connector action', async () => {
    clerkUserState.isSignedIn = false;
    stubLocation('https://app.example.com/connectors?category=Developer');

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect('linear', 'oauth');
    });

    expect(routerPush).toHaveBeenCalledWith(
      '/login?redirectTo=%2Fconnectors%3Fcategory%3DDeveloper',
    );
  });

  it('follows oauthStartPath on a 409 and appends the current page as returnPath', async () => {
    const location = stubLocation('https://app.example.com/connectors?category=Developer');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { connectors: [], available: ['linear'] }))
        .mockResolvedValueOnce(
          jsonResponse(409, {
            error: 'This connector connects through OAuth authorization, not a directory toggle.',
            connectorId: 'linear',
            oauthStartPath: '/api/connectors/oauth/start?connectorId=linear',
          }),
        ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect('linear', 'oauth');
    });

    const target = new URL(location.current, 'https://app.example.com');
    expect(target.pathname).toBe('/api/connectors/oauth/start');
    expect(target.searchParams.get('connectorId')).toBe('linear');
    expect(target.searchParams.get('returnPath')).toBe('/connectors?category=Developer');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still follows installStartPath for the GitHub App install flow', async () => {
    const location = stubLocation('https://app.example.com/connectors');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { connectors: [], available: ['github'] }))
        .mockResolvedValueOnce(
          jsonResponse(409, {
            error: 'GitHub connects through the GitHub App install flow, not a directory toggle.',
            connectorId: 'github',
            installStartPath: '/api/github/install/start',
          }),
        ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect('github', 'oauth');
    });

    expect(location.current).toBe('/api/github/install/start');
  });

  it('surfaces the server message and rolls back when no flow exists', async () => {
    stubLocation('https://app.example.com/connectors');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { connectors: [], available: [] }))
        .mockResolvedValueOnce(
          jsonResponse(501, {
            error:
              'Connector authorization is not implemented for this provider. Start the provider-specific OAuth or credential flow instead of marking it active.',
          }),
        ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect('asana', 'oauth');
    });

    expect(result.current.connectedIds.has('asana')).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('Connector authorization is not implemented'),
    );
  });

  it('reconnect keeps the connector listed while sending the user back to the provider', async () => {
    const location = stubLocation('https://app.example.com/connectors');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            connectors: [
              {
                connectorId: 'linear',
                source: 'oauth',
                scopes: ['read'],
                needsReauthorization: true,
              },
            ],
            available: ['linear'],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(409, {
            connectorId: 'linear',
            oauthStartPath: '/api/connectors/oauth/start?connectorId=linear',
          }),
        ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectedIds.has('linear')).toBe(true);

    await act(async () => {
      await result.current.reconnect('linear');
    });

    expect(result.current.connectedIds.has('linear')).toBe(true);
    expect(location.current).toContain('/api/connectors/oauth/start');
  });

  it('drops the cached scopes once a disconnect succeeds', async () => {
    stubLocation('https://app.example.com/connectors');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, {
            connectors: [
              {
                connectorId: 'linear',
                source: 'oauth',
                scopes: ['read'],
                needsReauthorization: true,
              },
            ],
            available: ['linear'],
          }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { success: true })),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.disconnect('linear');
    });

    expect(result.current.connectedIds.has('linear')).toBe(false);
    expect(result.current.grantedScopes['linear']).toBeUndefined();
    expect(result.current.needsReauthorizationIds.has('linear')).toBe(false);
  });
});

describe('connector OAuth start-path helpers', () => {
  afterEach(() => {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it('adds returnPath to the server-built start path without touching its other params', () => {
    stubLocation('https://app.example.com/connectors');
    expect(
      withConnectorReturnPath('/api/connectors/oauth/start?connectorId=linear', '/connectors'),
    ).toBe('/api/connectors/oauth/start?connectorId=linear&returnPath=%2Fconnectors');
  });

  it.each(['https://evil.example.com/steal', '//evil.example.com/steal', '\\/evil', 'relative'])(
    'refuses %s as a start path',
    (candidate) => {
      stubLocation('https://app.example.com/connectors');
      expect(withConnectorReturnPath(candidate, '/connectors')).toBeNull();
    },
  );

  it('strips a previous broker outcome out of the return path', () => {
    stubLocation('https://app.example.com/connectors?status=denied&connector=linear&tab=all');
    expect(currentConnectorReturnPath()).toBe('/connectors?tab=all');
  });
});

describe('useBrokerOutcome', () => {
  const replaceState = vi.fn();
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState = replaceState as typeof window.history.replaceState;
  });

  afterEach(() => {
    window.history.replaceState = originalReplaceState;
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it.each([
    ['connected', 'success', 'Notion is connected.'],
    ['denied', 'error', 'Authorization for Notion was declined. Nothing was connected.'],
    ['failed', 'error', 'Notion did not finish authorizing. Try connecting it again.'],
    [
      'invalid_state',
      'error',
      'The authorization for Notion expired before it completed. Start the connection again.',
    ],
    ['unavailable', 'error', 'Notion cannot be connected right now. Try again later.'],
    ['error', 'error', 'Something went wrong connecting Notion. Try again.'],
    ['open', 'info', 'Notion needs no authorization and is ready to use.'],
  ])('announces %s', (status, tone, message) => {
    stubLocation(`https://app.example.com/chat?connector=notion&status=${status}`);
    const onConnected = vi.fn();

    renderHook(() => useBrokerOutcome(onConnected));

    const sink = tone === 'success' ? toastSuccess : tone === 'info' ? toastInfo : toastError;
    expect(sink).toHaveBeenCalledWith(message);
    expect(onConnected).toHaveBeenCalledTimes(tone === 'success' ? 1 : 0);
  });

  it('names an unrecognised connector generically rather than printing its id', () => {
    stubLocation('https://app.example.com/chat?connector=not-a-real-one&status=denied');

    renderHook(() => useBrokerOutcome(vi.fn()));

    expect(toastError).toHaveBeenCalledWith(
      'Authorization for This connector was declined. Nothing was connected.',
    );
  });

  it('clears the outcome params so a reload does not replay the toast', () => {
    stubLocation('https://app.example.com/chat?connector=notion&status=denied&tab=all');

    renderHook(() => useBrokerOutcome(vi.fn()));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/chat?tab=all');
  });

  it('stays silent when there is no outcome to report', () => {
    stubLocation('https://app.example.com/chat');

    renderHook(() => useBrokerOutcome(vi.fn()));

    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('clears an unknown status without announcing anything', () => {
    stubLocation('https://app.example.com/chat?connector=notion&status=weird');

    renderHook(() => useBrokerOutcome(vi.fn()));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/chat');
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('useConnectors, deployment setup requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkUserState.isLoaded = true;
    clerkUserState.isSignedIn = true;
    invalidateConnectorsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries the env names each curated connector still needs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          connectors: [],
          available: ['notion'],
          setup: {
            gmail: {
              kind: 'oauth-client-pair',
              missingEnv: [
                'CONNECTOR_OAUTH_GMAIL_CLIENT_ID',
                'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET',
              ],
              message:
                'Gmail needs CONNECTOR_OAUTH_GMAIL_CLIENT_ID and CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET on this deployment.',
            },
          },
        }),
      ),
    );

    const { result } = renderHook(() => useConnectors());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setupRequirements['gmail']?.missingEnv).toEqual([
      'CONNECTOR_OAUTH_GMAIL_CLIENT_ID',
      'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET',
    ]);
    expect(result.current.setupRequirements['notion']).toBeUndefined();
  });
});

describe('useBrokerOutcome for a directory record', () => {
  const replaceState = vi.fn();
  const originalReplaceState = window.history.replaceState;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState = replaceState as typeof window.history.replaceState;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState = originalReplaceState;
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it('names the server from the directory and links its documentation when registration is refused', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        entry: { name: 'Cowork24', documentationUrl: 'https://cowork24.ch/docs/mcp' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    stubLocation(
      'https://app.example.com/chat?connector=ch.cowork24%2Fbooking&status=registration_rejected',
    );

    renderHook(() => useBrokerOutcome(vi.fn()));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Cowork24 refused to register this app, so it cannot be connected here.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Open documentation' }),
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connectors/directory/ch.cowork24/booking',
      expect.anything(),
    );
    expect(replaceState).toHaveBeenCalledWith(null, '', '/chat');
  });

  it('announces a connected directory record by its real name', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { entry: { name: 'Tandem Docs MCP', documentationUrl: null } }),
        ),
    );
    stubLocation('https://app.example.com/chat?connector=ac.tandem%2Fdocs-mcp&status=connected');
    const onConnected = vi.fn();

    renderHook(() => useBrokerOutcome(onConnected));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Tandem Docs MCP is connected.'));
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic name when the directory lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    stubLocation('https://app.example.com/chat?connector=io.github.x%2Fy&status=denied');

    renderHook(() => useBrokerOutcome(vi.fn()));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Authorization for This connector was declined. Nothing was connected.',
      ),
    );
  });
});
