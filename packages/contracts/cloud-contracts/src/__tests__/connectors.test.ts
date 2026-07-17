/**
 * Tests for the connectors REST API contract mirrored from
 * `apps/web/app/api/connectors/route.ts` and
 * `apps/web/app/api/connectors/custom/route.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  ConnectorConnectionSchema,
  ListConnectorsResponseSchema,
  ConnectRequestSchema,
  ConnectSuccessResponseSchema,
  ConnectConflictResponseSchema,
  DisconnectResponseSchema,
  CustomConnectorSchema,
  ListCustomConnectorsResponseSchema,
  CreateCustomConnectorRequestSchema,
  CreateCustomConnectorResponseSchema,
  DeleteCustomConnectorResponseSchema,
} from '../connectors';

describe('ConnectorConnectionSchema / ListConnectorsResponseSchema', () => {
  it('accepts a user-sourced row (route.ts:151-158)', () => {
    const row = {
      id: 'conn_1',
      connectorId: 'slack',
      authType: 'oauth',
      connectedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      source: 'user',
    };
    expect(ConnectorConnectionSchema.safeParse(row).success).toBe(true);
  });

  it('accepts the synthetic github-app row with empty connectedAt/updatedAt (route.ts:164-174)', () => {
    const row = {
      id: 'github-app-123',
      connectorId: 'github',
      authType: 'github_app',
      connectedAt: '',
      updatedAt: '',
      source: 'github-app',
    };
    expect(ConnectorConnectionSchema.safeParse(row).success).toBe(true);
  });

  it('accepts a custom-sourced row: id is the row uuid, connectorId is custom-<shortId> (route.ts:180-194)', () => {
    const row = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // list/DELETE key
      connectorId: 'custom-a1b2c3d4e5', // matches the chat tool loop's serverId
      authType: 'custom_mcp',
      connectedAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      source: 'custom',
      name: 'Internal MCP',
    };
    expect(ConnectorConnectionSchema.safeParse(row).success).toBe(true);
  });

  it('accepts a row without a name (built-in and github-app rows never have one)', () => {
    const row = {
      id: 'conn_1',
      connectorId: 'slack',
      authType: 'oauth',
      connectedAt: '',
      updatedAt: '',
      source: 'user',
    };
    expect(ConnectorConnectionSchema.safeParse(row).success).toBe(true);
  });

  it('accepts the full GET /api/connectors response shape (route.ts:193)', () => {
    const response = {
      connectors: [
        {
          id: 'conn_1',
          connectorId: 'notion',
          authType: 'oauth',
          connectedAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          source: 'user',
        },
      ],
      available: ['local-filesystem', 'terminal', 'github'],
    };
    expect(ListConnectorsResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects an unknown source value', () => {
    const row = {
      id: 'conn_1',
      connectorId: 'slack',
      authType: 'oauth',
      connectedAt: '',
      updatedAt: '',
      source: 'admin-provisioned',
    };
    expect(ConnectorConnectionSchema.safeParse(row).success).toBe(false);
  });
});

describe('ConnectRequestSchema / ConnectSuccessResponseSchema / ConnectConflictResponseSchema', () => {
  it('accepts a request with only connectorId (authType optional, route.ts:215-217)', () => {
    expect(ConnectRequestSchema.safeParse({ connectorId: 'notion' }).success).toBe(true);
  });

  it('accepts the 201 success body, now including source (route.ts:295-309)', () => {
    const body = {
      connector: {
        id: 'conn_1',
        connectorId: 'notion',
        authType: 'oauth',
        connectedAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        source: 'user',
      },
    };
    expect(ConnectSuccessResponseSchema.safeParse(body).success).toBe(true);
  });

  it('rejects the 201 body if source is missing (the asymmetry that was fixed server-side)', () => {
    const body = {
      connector: {
        id: 'conn_1',
        connectorId: 'notion',
        authType: 'oauth',
        connectedAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    };
    expect(ConnectSuccessResponseSchema.safeParse(body).success).toBe(false);
  });

  it('accepts the github conflict body (installStartPath, no authType, route.ts:235-242)', () => {
    const body = {
      error: 'GitHub connects through the GitHub App install flow, not a directory toggle.',
      connectorId: 'github',
      installStartPath: '/api/github/install/start',
    };
    expect(ConnectConflictResponseSchema.safeParse(body).success).toBe(true);
  });

  it('accepts the generic 501 body (authType, no installStartPath, route.ts:250-258)', () => {
    const body = {
      error: 'Connector authorization is not implemented for this provider.',
      connectorId: 'salesforce',
      authType: 'oauth',
    };
    expect(ConnectConflictResponseSchema.safeParse(body).success).toBe(true);
  });
});

describe('DisconnectResponseSchema', () => {
  it('accepts { success: true } (route.ts:345, 364)', () => {
    expect(DisconnectResponseSchema.safeParse({ success: true }).success).toBe(true);
  });
});

describe('custom-connector contract (apps/web/app/api/connectors/custom/route.ts)', () => {
  // Real GET /api/connectors/custom row shape (getUserCustomConnectorSummaries).
  const customConnector = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    shortId: 'a1b2c3d4e5',
    name: 'Internal MCP',
    url: 'https://mcp.internal.example.com/sse',
    transport: 'sse',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('CustomConnectorSchema accepts the real row shape and carries no secret fields', () => {
    const parsed = CustomConnectorSchema.safeParse(customConnector);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data).sort()).toEqual(
        ['id', 'shortId', 'name', 'url', 'transport', 'createdAt', 'updatedAt'].sort(),
      );
    }
  });

  it('CustomConnectorSchema rejects a row missing shortId (user-connector-tools.ts always returns it)', () => {
    const { shortId: _omitted, ...rest } = customConnector;
    expect(CustomConnectorSchema.safeParse(rest).success).toBe(false);
  });

  it('CustomConnectorSchema rejects an unknown transport', () => {
    expect(
      CustomConnectorSchema.safeParse({ ...customConnector, transport: 'websocket' }).success,
    ).toBe(false);
  });

  it('ListCustomConnectorsResponseSchema accepts an array of custom connectors (custom/route.ts:130)', () => {
    expect(
      ListCustomConnectorsResponseSchema.safeParse({ connectors: [customConnector] }).success,
    ).toBe(true);
  });

  it('CreateCustomConnectorRequestSchema accepts name/url only (transport and authToken optional, custom/route.ts:165-175)', () => {
    expect(
      CreateCustomConnectorRequestSchema.safeParse({
        name: 'Internal MCP',
        url: 'https://mcp.internal.example.com/sse',
      }).success,
    ).toBe(true);
  });

  it('CreateCustomConnectorRequestSchema accepts an explicit transport and an authToken', () => {
    expect(
      CreateCustomConnectorRequestSchema.safeParse({
        name: 'Internal MCP',
        url: 'https://mcp.internal.example.com',
        transport: 'streamable-http',
        authToken: 'secret-token',
      }).success,
    ).toBe(true);
  });

  it('CreateCustomConnectorRequestSchema rejects a name over 200 chars (custom/route.ts:159)', () => {
    expect(
      CreateCustomConnectorRequestSchema.safeParse({
        name: 'x'.repeat(201),
        url: 'https://mcp.internal.example.com',
      }).success,
    ).toBe(false);
  });

  it('CreateCustomConnectorResponseSchema requires toolCount as a sibling of connector (custom/route.ts:256-269)', () => {
    expect(
      CreateCustomConnectorResponseSchema.safeParse({
        connector: customConnector,
        toolCount: 5,
      }).success,
    ).toBe(true);
    expect(
      CreateCustomConnectorResponseSchema.safeParse({ connector: customConnector }).success,
    ).toBe(false);
  });

  it('rejects a POST response whose connector is missing shortId (custom/route.ts:257-269 always returns it)', () => {
    const { shortId: _omitted, ...connectorWithoutShortId } = customConnector;
    expect(
      CreateCustomConnectorResponseSchema.safeParse({
        connector: connectorWithoutShortId,
        toolCount: 5,
      }).success,
    ).toBe(false);
  });

  it('accepts the real POST response shape (shortId included, custom/route.ts:257-272)', () => {
    expect(
      CreateCustomConnectorResponseSchema.safeParse({
        connector: customConnector,
        toolCount: 5,
      }).success,
    ).toBe(true);
  });

  it('DeleteCustomConnectorResponseSchema matches the built-in disconnect shape', () => {
    expect(DeleteCustomConnectorResponseSchema.safeParse({ success: true }).success).toBe(true);
  });
});
