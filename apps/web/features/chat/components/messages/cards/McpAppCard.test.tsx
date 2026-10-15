import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpAppCardBody } from '@agiworkforce/types';

const loggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  getCsrfToken: () => Promise.resolve('csrf-token'),
}));
vi.mock('@shared/lib/logger', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerError,
    auth: vi.fn(),
    app: vi.fn(),
  };
  return { logger, default: logger };
});

import {
  MCP_APP_RESOURCE_MAX_BYTES,
  MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE,
  MCP_APP_TOO_LARGE_MESSAGE,
  McpAppCard,
} from './McpAppCard';

type CsrfModule = typeof import('@/lib/client/csrf');

const BODY = {
  payloadId: 'payload-1',
  connectorId: 'acme',
  resourceUri: 'ui://acme/board',
  toolName: 'show_board',
} as McpAppCardBody;

const PAYLOAD = {
  id: 'payload-1',
  connectorId: 'acme',
  resourceUri: 'ui://acme/board',
  toolName: 'show_board',
  toolInput: {},
  toolResult: { content: [{ type: 'text', text: 'Three open tickets' }] },
};

function respond(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubServer(html: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/mcp-apps/payload/')) return respond(PAYLOAD);
    if (url.endsWith('/mcp')) {
      return respond({
        connectorId: BODY.connectorId,
        result: {
          contents: [{ uri: BODY.resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
        },
      });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mcpCalls(fetchMock: ReturnType<typeof stubServer>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/mcp')).length;
}

beforeEach(() => {
  loggerError.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('McpAppCard refuses a same-origin sandbox in production', () => {
  it('renders the plain tool result when no sandbox origin is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', '');
    const fetchMock = stubServer('<p>app</p>');

    const { container } = render(<McpAppCard body={BODY} />);

    expect(await screen.findByText(MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Three open tickets')).toBeTruthy();
    expect(container.querySelector('iframe')?.getAttribute('src')).toBeNull();
    expect(mcpCalls(fetchMock)).toBe(0);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('[mcp-app]'),
      expect.objectContaining({ reason: 'sandbox_origin_unavailable', connectorId: 'acme' }),
    );
  });

  it('renders the plain tool result when the configured origin is the app origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', window.location.origin);
    stubServer('<p>app</p>');

    render(<McpAppCard body={BODY} />);

    expect(await screen.findByText(MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Three open tickets')).toBeTruthy();
  });

  it('frames a dedicated sandbox origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', 'https://apps.sandbox.test');
    stubServer('<p>app</p>');

    const { container, unmount } = render(<McpAppCard body={BODY} />);

    await waitFor(() =>
      expect(container.querySelector('iframe')?.getAttribute('src')).toMatch(
        /^https:\/\/apps\.sandbox\.test\/api\/mcp-apps\/sandbox/,
      ),
    );
    expect(screen.queryByText(MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE)).toBeNull();
    unmount();
  });
});

describe('McpAppCard caps the size of an app resource', () => {
  it('shows the plain tool result when the HTML is over the cap', async () => {
    vi.stubEnv('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', 'https://apps.sandbox.test');
    stubServer('a'.repeat(MCP_APP_RESOURCE_MAX_BYTES + 1));

    const { container } = render(<McpAppCard body={BODY} />);

    expect(await screen.findByText(MCP_APP_TOO_LARGE_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Three open tickets')).toBeTruthy();
    expect(container.querySelector('iframe')?.getAttribute('src')).toBeNull();
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'resource_too_large' }),
    );
  });

  it('measures bytes, not characters', async () => {
    vi.stubEnv('NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN', 'https://apps.sandbox.test');
    stubServer('é'.repeat(MCP_APP_RESOURCE_MAX_BYTES / 2 + 1));

    render(<McpAppCard body={BODY} />);

    expect(await screen.findByText(MCP_APP_TOO_LARGE_MESSAGE)).toBeTruthy();
  });
});
