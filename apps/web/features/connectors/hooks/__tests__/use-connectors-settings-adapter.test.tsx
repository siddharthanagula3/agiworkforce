import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const directoryOptions = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}));

vi.mock('@/features/directory', () => ({
  CONNECTOR_REAUTHORIZATION_COPY: 'Reconnect this connector.',
  useDirectoryAdapter: (options: Record<string, unknown>) => {
    directoryOptions.current = options;
    return { loadSection: vi.fn() };
  },
}));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn().mockResolvedValue('csrf-1') }));

vi.mock('@/features/connectors/components/ConnectorApiKeyForm', () => ({
  ConnectorApiKeyForm: () => <div data-testid="api-key-form" />,
}));
vi.mock('@/features/connectors/components/ConnectorCapabilitiesPanel', () => ({
  ConnectorCapabilitiesPanel: ({ connectorRef }: { connectorRef: string }) => (
    <div data-testid="capabilities" data-ref={connectorRef} />
  ),
}));
vi.mock('@/features/connectors/components/ConnectorConsentSummary', () => ({
  ConnectorConsentSummary: () => <div data-testid="consent" />,
}));
vi.mock('@/features/connectors/components/ConnectorScopeList', () => ({
  ConnectorScopeList: ({ connectorId }: { connectorId: string }) => (
    <div data-testid="scopes" data-id={connectorId} />
  ),
}));

import { useConnectorsSettingsAdapter } from '../use-connectors-settings-adapter';

const CONNECTED_BODY = {
  connectors: [
    {
      connectorId: 'io.sentry/mcp',
      connectedAt: '2026-09-05T00:00:00.000Z',
      needsReauthorization: false,
    },
  ],
  available: [],
};

const LINKED_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sentry',
  url: 'https://mcp.sentry.dev/mcp',
  createdAt: '2026-09-05T00:00:00.000Z',
  directoryId: 'io.sentry/mcp',
};

const SELF_ADDED_ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'My own MCP',
  url: 'https://mcp.example.com/mcp',
  createdAt: '2026-09-05T00:00:00.000Z',
};

function stubFetch(customRows: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const body = url.includes('/api/connectors/custom')
        ? { connectors: customRows }
        : url.includes('/api/github/installations')
          ? { installations: [] }
          : CONNECTED_BODY;
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

function renderAdapter() {
  return renderHook(() =>
    useConnectorsSettingsAdapter({
      open: true,
      authedHeaders: async () => ({}),
    }),
  );
}

function footerFor(detail: Record<string, unknown>, connectorId: string): ReactNode {
  const render = directoryOptions.current?.['renderConnectorDetailFooter'] as (
    id: string,
    detail: unknown,
  ) => ReactNode;
  return render(connectorId, detail);
}

beforeEach(() => {
  vi.clearAllMocks();
  directoryOptions.current = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('duplicate tiles', () => {
  it('does not list a directory-linked row as its own custom connector', async () => {
    stubFetch([LINKED_ROW, SELF_ADDED_ROW]);
    renderAdapter();

    await waitFor(() => {
      const curated = directoryOptions.current?.['curatedConnectors'] as { id: string }[];
      expect(curated.some((c) => c.id.endsWith(SELF_ADDED_ROW.id))).toBe(true);
    });

    const curated = directoryOptions.current?.['curatedConnectors'] as { id: string }[];
    expect(curated.some((c) => c.id.endsWith(LINKED_ROW.id))).toBe(false);

    const connected = directoryOptions.current?.['connectedConnectors'] as {
      connectorId: string;
    }[];
    expect(connected.map((c) => c.connectorId)).toContain('io.sentry/mcp');
    expect(connected.some((c) => c.connectorId.endsWith(LINKED_ROW.id))).toBe(false);
  });
});

describe('connector detail footer', () => {
  it('shows the consent summary and requested scopes before connecting', async () => {
    stubFetch([]);
    renderAdapter();
    await waitFor(() => expect(directoryOptions.current).not.toBeNull());

    render(<>{footerFor({ connected: false, tools: [] }, 'gmail')}</>);

    expect(screen.getByTestId('consent')).toBeVisible();
    expect(screen.getByTestId('scopes').getAttribute('data-id')).toBe('gmail');
    expect(screen.queryByTestId('capabilities')).toBeNull();
    expect(screen.queryByRole('button', { name: /Tool permissions/ })).toBeNull();
  });

  it('shows live capabilities and the tool permissions entry once connected', async () => {
    stubFetch([]);
    renderAdapter();
    await waitFor(() => expect(directoryOptions.current).not.toBeNull());

    render(<>{footerFor({ connected: true, tools: ['search'] }, 'io.sentry/mcp')}</>);

    expect(screen.getByTestId('capabilities').getAttribute('data-ref')).toBe('io.sentry/mcp');
    expect(screen.getByRole('button', { name: /Tool permissions/ })).toBeVisible();
    expect(screen.queryByTestId('consent')).toBeNull();
    expect(screen.queryByTestId('scopes')).toBeNull();
  });
});

describe('tool permissions for a directory-sourced connector', () => {
  const DIRECTORY_ID = 'com.microsoft/microsoft-learn-mcp';

  function detail(patch: Record<string, unknown> = {}) {
    return {
      kind: 'connector',
      id: DIRECTORY_ID,
      name: 'Microsoft Learn',
      monogram: 'ML',
      connected: true,
      tools: ['microsoft_docs_search'],
      ...patch,
    };
  }

  it('opens for a connector that is in no curated list', async () => {
    stubFetch([]);
    const { result } = renderAdapter();
    await waitFor(() => expect(directoryOptions.current).not.toBeNull());

    render(<>{footerFor(detail(), DIRECTORY_ID)}</>);
    fireEvent.click(screen.getByRole('button', { name: /Tool permissions/ }));

    await waitFor(() => expect(result.current.toolPermissionsConnector).not.toBeNull());
    expect(result.current.toolPermissionsConnector).toEqual({
      id: DIRECTORY_ID,
      name: 'Microsoft Learn',
      iconText: 'ML',
      iconBg: expect.any(String),
    });
  });

  it('falls back to the connector name when the record carries no monogram', async () => {
    stubFetch([]);
    const { result } = renderAdapter();
    await waitFor(() => expect(directoryOptions.current).not.toBeNull());

    render(<>{footerFor(detail({ monogram: undefined }), DIRECTORY_ID)}</>);
    fireEvent.click(screen.getByRole('button', { name: /Tool permissions/ }));

    await waitFor(() => expect(result.current.toolPermissionsConnector?.iconText).toBe('MI'));
  });

  it('closes on request', async () => {
    stubFetch([]);
    const { result } = renderAdapter();
    await waitFor(() => expect(directoryOptions.current).not.toBeNull());

    render(<>{footerFor(detail(), DIRECTORY_ID)}</>);
    fireEvent.click(screen.getByRole('button', { name: /Tool permissions/ }));
    await waitFor(() => expect(result.current.toolPermissionsConnector).not.toBeNull());

    result.current.setToolPermissionsConnectorId(null);
    await waitFor(() => expect(result.current.toolPermissionsConnector).toBeNull());
  });
});

describe('github disconnect partial state', () => {
  const INSTALLATIONS = [
    {
      id: 'row-1',
      installation_id: 111,
      account_login: 'acme',
      account_type: 'Organization',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'row-2',
      installation_id: 222,
      account_login: 'personal',
      account_type: 'User',
      created_at: '2026-02-02T00:00:00.000Z',
    },
  ];

  function stubGithubFetch(failOn: number, errorBody: { error?: string }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/github/installations')) {
          if (init?.method === 'DELETE') {
            const body = JSON.parse(String(init.body)) as { installationId: number };
            if (body.installationId === failOn) {
              return { ok: false, status: 502, json: async () => errorBody };
            }
            return { ok: true, status: 200, json: async () => ({ success: true }) };
          }
          return { ok: true, status: 200, json: async () => ({ installations: INSTALLATIONS }) };
        }
        if (url.includes('/api/connectors/custom')) {
          return { ok: true, status: 200, json: async () => ({ connectors: [] }) };
        }
        return { ok: true, status: 200, json: async () => CONNECTED_BODY };
      }),
    );
  }

  function directoryOption<T>(key: string): T {
    return directoryOptions.current?.[key] as T;
  }

  it('surfaces the reason GitHub gave instead of a generic retry line', async () => {
    stubGithubFetch(222, { error: 'The GitHub App is still installed on your account.' });
    renderAdapter();

    await waitFor(() =>
      expect(
        directoryOption<Array<{ connectorId: string }>>('connectedConnectors').some(
          (c) => c.connectorId === 'github',
        ),
      ).toBe(true),
    );

    const disconnect = directoryOption<(id: string) => Promise<void>>('onDisconnectConnector');
    await expect(disconnect('github')).rejects.toThrow(
      'The GitHub App is still installed on your account.',
    );
  });
});

describe('github pull request review setting', () => {
  const INSTALLATIONS = [
    {
      id: 'row-1',
      installation_id: 111,
      account_login: 'acme',
      account_type: 'Organization',
      created_at: '2026-01-01T00:00:00.000Z',
      pr_review_enabled: false,
    },
  ];

  function stubGithubFetch(patchOk: boolean, patchBody: { error?: string } = {}) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/api/github/installations')) {
          if (init?.method === 'PATCH') {
            return patchOk
              ? { ok: true, status: 200, json: async () => ({}) }
              : { ok: false, status: 500, json: async () => patchBody };
          }
          return { ok: true, status: 200, json: async () => ({ installations: INSTALLATIONS }) };
        }
        if (url.includes('/api/connectors/custom')) {
          return { ok: true, status: 200, json: async () => ({ connectors: [] }) };
        }
        return { ok: true, status: 200, json: async () => CONNECTED_BODY };
      }),
    );
    return calls;
  }

  function githubFooter(): ReactNode {
    return footerFor({ connected: true, name: 'GitHub' }, 'github');
  }

  it('offers a per-installation toggle in the github connector detail', async () => {
    stubGithubFetch(true);
    renderAdapter();

    await waitFor(() => expect(directoryOptions.current).not.toBeNull());
    await waitFor(() => {
      render(<>{githubFooter()}</>);
      expect(screen.getByTestId('github-pr-review-111')).toBeTruthy();
    });
    expect(screen.getByTestId('github-pr-review-111')).not.toBeChecked();
  });

  it('writes the setting through the installations route with the csrf header', async () => {
    const calls = stubGithubFetch(true);
    renderAdapter();

    await waitFor(() => expect(directoryOptions.current).not.toBeNull());
    await waitFor(() => {
      render(<>{githubFooter()}</>);
      expect(screen.getByTestId('github-pr-review-111')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('github-pr-review-111'));

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.init?.body))).toEqual({
        installationId: 111,
        prReviewEnabled: true,
      });
    });
    const { getCsrfToken } = await import('@/lib/client/csrf');
    expect(getCsrfToken).toHaveBeenCalled();
  });

  it('puts the toggle back when the write is refused, instead of showing it on', async () => {
    stubGithubFetch(false, { error: 'Installation not found' });
    renderAdapter();

    await waitFor(() => expect(directoryOptions.current).not.toBeNull());
    await waitFor(() => {
      render(<>{githubFooter()}</>);
      expect(screen.getByTestId('github-pr-review-111')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('github-pr-review-111'));

    await waitFor(() => {
      render(<>{githubFooter()}</>);
      for (const box of screen.getAllByTestId('github-pr-review-111')) {
        expect(box).not.toBeChecked();
      }
    });
  });
});
