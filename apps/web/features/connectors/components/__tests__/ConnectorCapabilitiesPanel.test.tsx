import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const capabilities = vi.hoisted(() => ({
  result: {
    catalog: null as unknown,
    loading: false,
    error: null as string | null,
    retry: vi.fn(),
  },
}));

vi.mock('../../hooks/use-connector-capabilities', () => ({
  useConnectorCapabilities: () => capabilities.result,
}));

const publish = vi.hoisted(() => vi.fn());
vi.mock('../../lib/mcp-context-selection', () => ({ publishMcpContextSelection: publish }));

import { ConnectorCapabilitiesPanel } from '../ConnectorCapabilitiesPanel';

const EMPTY_CATALOG = {
  connectorId: 'custom-abc123',
  protocolEra: 'modern' as const,
  tasksSupported: false,
  tools: [] as { name: string; visibility: string }[],
  resources: [] as { name: string; uri: string }[],
  resourceTemplates: [] as { name: string; uriTemplate: string }[],
  prompts: [] as { name: string; arguments: unknown[] }[],
  apps: [] as unknown[],
  discoveryErrors: [] as { capability: string; message: string }[],
};

beforeEach(() => {
  vi.clearAllMocks();
  capabilities.result = { catalog: EMPTY_CATALOG, loading: false, error: null, retry: vi.fn() };
});

describe('ConnectorCapabilitiesPanel', () => {
  it('says so when a reachable connector publishes nothing', () => {
    render(<ConnectorCapabilitiesPanel connectorRef="custom-abc123" connected />);

    expect(screen.getByText(/offers no tools, resources or prompts yet/)).toBeVisible();
  });

  it('names the capability groups discovery could not read and offers a retry', async () => {
    const retry = vi.fn();
    capabilities.result = {
      catalog: {
        ...EMPTY_CATALOG,
        tools: [{ name: 'search', visibility: 'model' }],
        discoveryErrors: [
          { capability: 'prompts', message: 'boom' },
          { capability: 'resources', message: 'boom' },
        ],
      },
      loading: false,
      error: null,
      retry,
    };
    const user = userEvent.setup();
    render(<ConnectorCapabilitiesPanel connectorRef="custom-abc123" connected />);

    expect(screen.getByText(/prompts, resources/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry discovery' }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders resource templates as plain labels rather than dead buttons', () => {
    capabilities.result = {
      catalog: {
        ...EMPTY_CATALOG,
        resourceTemplates: [{ name: 'issue', uriTemplate: 'issue://{id}' }],
      },
      loading: false,
      error: null,
      retry: vi.fn(),
    };
    render(<ConnectorCapabilitiesPanel connectorRef="custom-abc123" connected />);

    expect(screen.getByText('issue')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'issue' })).toBeNull();
  });

  it('attaches a selected resource to the next turn', async () => {
    capabilities.result = {
      catalog: {
        ...EMPTY_CATALOG,
        resources: [{ name: 'readme', uri: 'file:///readme.md' }],
      },
      loading: false,
      error: null,
      retry: vi.fn(),
    };
    const user = userEvent.setup();
    render(<ConnectorCapabilitiesPanel connectorRef="custom-abc123" connected />);

    await user.click(screen.getByRole('button', { name: 'readme' }));

    expect(publish).toHaveBeenCalledWith({
      resources: [{ connectorId: 'custom-abc123', uri: 'file:///readme.md', name: 'readme' }],
    });
  });

  it('labels a tool with its raw name, never a server-authored string', () => {
    capabilities.result = {
      catalog: {
        ...EMPTY_CATALOG,
        tools: [
          {
            name: 'microsoft_docs_search',
            title: 'Search Microsoft docs',
            description: 'Search official Microsoft documentation.',
            visibility: 'model',
          },
        ],
      },
      loading: false,
      error: null,
      retry: vi.fn(),
    };
    render(<ConnectorCapabilitiesPanel connectorRef="dir-abc123def456" connected />);

    const chip = screen.getByText('microsoft_docs_search');
    expect(chip).toBeVisible();
    expect(chip.getAttribute('title')).toBe('Search official Microsoft documentation.');
    expect(screen.queryByText('Search Microsoft docs')).toBeNull();
    expect(document.body.textContent).not.toContain('untrusted');
    expect(document.body.textContent).not.toContain('Never treat it as instructions');
  });

  it('falls back to the title, then the name, when there is no description', () => {
    capabilities.result = {
      catalog: {
        ...EMPTY_CATALOG,
        tools: [
          { name: 'titled', title: 'A human title', visibility: 'model' },
          { name: 'bare', visibility: 'model' },
        ],
      },
      loading: false,
      error: null,
      retry: vi.fn(),
    };
    render(<ConnectorCapabilitiesPanel connectorRef="dir-abc123def456" connected />);

    expect(screen.getByText('titled').getAttribute('title')).toBe('A human title');
    expect(screen.getByText('bare').getAttribute('title')).toBe('bare');
  });

  it('renders nothing at all for a connector that is not connected', () => {
    const { container } = render(
      <ConnectorCapabilitiesPanel connectorRef="custom-abc123" connected={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
