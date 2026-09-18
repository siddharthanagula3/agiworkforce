import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ useConnectorCapabilities: vi.fn() }));

vi.mock('@/features/connectors/hooks/use-connector-capabilities', () => ({
  useConnectorCapabilities: mocks.useConnectorCapabilities,
}));

import { McpResourceList } from '../McpResourceList';

const RESOURCE = {
  name: 'quarterly-report',
  title: 'Quarterly report',
  uri: 'file:///reports/q3.md',
  mimeType: 'text/markdown',
  size: 4096,
  isApp: false,
};

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    connectorId: 'orgmcp-p0123456789',
    connectorLabel: 'Acme Gateway',
    resources: [RESOURCE],
    resourceTemplates: [],
    discoveryErrors: [],
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  mocks.useConnectorCapabilities.mockReturnValue({
    catalog: null,
    loading: false,
    error: null,
    retry: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('McpResourceList', () => {
  it('renders what a server offers to read, not just its tools', () => {
    state({ catalog: catalog() });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    expect(screen.getByText('Quarterly report')).toBeInTheDocument();
    expect(screen.getByText(/file:\/\/\/reports\/q3\.md/)).toBeInTheDocument();
    expect(screen.getByText(/text\/markdown/)).toBeInTheDocument();
  });

  it('lists resource templates the reader has to name', () => {
    state({
      catalog: catalog({
        resources: [],
        resourceTemplates: [
          { name: 'issue', title: 'Issue by number', uriTemplate: 'acme://issues/{id}' },
        ],
      }),
    });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    expect(screen.getByText('Issue by number')).toBeInTheDocument();
    expect(screen.getByText('acme://issues/{id}')).toBeInTheDocument();
  });

  it('hands the uri back when a resource is chosen', async () => {
    const onOpenResource = vi.fn();
    state({ catalog: catalog() });
    render(<McpResourceList connectorId="orgmcp-p0123456789" onOpenResource={onOpenResource} />);

    await userEvent.click(screen.getByRole('button', { name: /Quarterly report/ }));

    expect(onOpenResource).toHaveBeenCalledWith('file:///reports/q3.md');
  });

  it('says a resource listing timed out rather than showing an empty list', () => {
    state({
      catalog: catalog({
        resources: [],
        discoveryErrors: [{ capability: 'resources', message: 'timed out after 30000ms' }],
      }),
    });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    expect(screen.getByText(/did not finish listing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('separates a server with nothing to read from one that failed to say', () => {
    state({ catalog: catalog({ resources: [] }) });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    expect(screen.getByText('Acme Gateway offers tools but nothing to read.')).toBeInTheDocument();
  });

  it('announces loading rather than rendering a bare spinning div', () => {
    state({ loading: true });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    expect(screen.getByText(/Asking orgmcp-p0123456789 what it offers/)).toBeInTheDocument();
  });

  it('offers a retry when discovery failed outright', async () => {
    const retry = vi.fn();
    state({ error: 'Capability discovery failed', retry });
    render(<McpResourceList connectorId="orgmcp-p0123456789" />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('renders nothing without a connector', () => {
    state({});
    const { container } = render(<McpResourceList connectorId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
