import { describe, expect, it, vi } from 'vitest';
import type { ConnectorConnection } from '@agiworkforce/cloud-contracts';
import {
  ConnectorTreeItem,
  ConnectorsTreeProvider,
  MANAGE_CONNECTORS_COMMAND,
  REFRESH_CONNECTORS_COMMAND,
  connectorsWebUrl,
} from '../features/connectors/connectorsTree';
import {
  connectorHealth,
  describeConnectorFailure,
} from '../features/connectors/connectorPresentation';

function makeConnector(overrides: Partial<ConnectorConnection> = {}): ConnectorConnection {
  return {
    id: 'conn_1',
    connectorId: 'slack',
    authType: 'oauth',
    connectedAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    source: 'user',
    health: 'connected',
    ...overrides,
  };
}

describe('connectors tree', () => {
  it('maps the hosted connector list into items with their status', async () => {
    const client = {
      listConnectors: vi.fn().mockResolvedValue({
        connectors: [
          makeConnector(),
          makeConnector({
            id: 'conn_2',
            connectorId: 'notion',
            source: 'oauth',
            health: 'needs-reauthorization',
            needsReauthorization: true,
          }),
        ],
        available: ['slack', 'github'],
        pending: ['linear'],
      }),
    };
    const provider = new ConnectorsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const items = await provider.getChildren();

      expect(items).toHaveLength(3);
      const [first, second, pending] = items as ConnectorTreeItem[];
      expect(first?.label).toBe('slack');
      expect(first?.contextValue).toBe('connector');
      expect(String(first?.description)).toContain('Connected');
      expect(second?.contextValue).toBe('connectorNeedsReauthorization');
      expect(String(second?.description)).toContain('Needs reauthorization');
      expect(pending?.label).toBe('linear');
      expect(String(pending?.tooltip)).toContain('never finished');
      expect((first?.command as { command: string }).command).toBe(MANAGE_CONNECTORS_COMMAND);
    } finally {
      provider.dispose();
    }
  });

  it('asks the user to sign in rather than showing an empty list', async () => {
    const provider = new ConnectorsTreeProvider(() => Promise.resolve({ status: 'signed-out' }));
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Sign in to see your connectors');
      expect((notice?.command as { command: string }).command).toBe('agi-workforce.signIn');
    } finally {
      provider.dispose();
    }
  });

  it('names an expired session when the hosted route answers 401', async () => {
    const client = { listConnectors: vi.fn().mockRejectedValue({ status: 401 }) };
    const provider = new ConnectorsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Connectors could not be loaded');
      expect(String(notice?.tooltip)).toBe(describeConnectorFailure({ status: 401 }));
      expect((notice?.command as { command: string }).command).toBe(REFRESH_CONNECTORS_COMMAND);
    } finally {
      provider.dispose();
    }
  });

  it('sends the user to the browser to add one, because authorization happens there', async () => {
    const client = {
      listConnectors: vi.fn().mockResolvedValue({ connectors: [], available: [] }),
    };
    const provider = new ConnectorsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('No connectors yet');
      expect((notice?.command as { command: string }).command).toBe(MANAGE_CONNECTORS_COMMAND);
    } finally {
      provider.dispose();
    }
    expect(connectorsWebUrl('https://agiworkforce.com')).toBe(
      'https://agiworkforce.com/settings/connectors?from=vscode-extension',
    );
  });

  it('reads reauthorization from the flag when the route omits health', () => {
    expect(connectorHealth(makeConnector({ health: undefined }))).toBe('connected');
    expect(connectorHealth(makeConnector({ health: undefined, needsReauthorization: true }))).toBe(
      'needs-reauthorization',
    );
  });
});
