/**
 * useConnectors — OAuth broker behavior.
 *
 * The shapes asserted here are the ones `app/api/connectors/route.ts` actually
 * returns: `source: 'oauth'` entries carry `scopes` and `needsReauthorization`,
 * and POST answers a configured-but-unconnected OAuth provider with 409 +
 * `oauthStartPath` (built server-side by `buildConnectorOAuthStartPath`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('test-csrf-token'),
}));

import {
  useConnectors,
  invalidateConnectorsCache,
  withConnectorReturnPath,
  currentConnectorReturnPath,
} from '../use-connectors';

/** jsdom's real `location` refuses assignment; swap in a recordable stand-in. */
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

describe('useConnectors — OAuth grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // Regression guard: the hook only followed `installStartPath` (the GitHub App
  // alias). A configured OAuth provider that stops emitting that alias would
  // have shown a generic "could not connect" toast instead of the consent screen.
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

  // Honest unavailability: POST 501s a provider with no flow configured. The
  // user must see the server's reason, not an optimistic connected row.
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

  // A dead grant is still a connected row. reconnect() must not blink the
  // connector out of the connected list on its way to the consent screen.
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

  // The start path is a navigation target handed back by the API. Refusing
  // anything that is not a same-origin absolute path keeps a malformed or
  // tampered body from turning into an off-origin redirect.
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
