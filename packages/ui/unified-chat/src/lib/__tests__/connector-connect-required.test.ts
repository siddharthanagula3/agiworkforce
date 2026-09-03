import { describe, it, expect } from 'vitest';

import {
  buildConnectHref,
  readConnectorConnectRequest,
  type ConnectorAuthorizationReason,
} from '../connector-connect-required';

function serverPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agi_connector_authorization_required: true,
    connectorId: 'linear',
    connectorName: 'Linear',
    toolName: 'search_issues',
    reason: 'not_connected' satisfies ConnectorAuthorizationReason,
    connectUrl: '/api/connectors/oauth/start?connectorId=linear',
    scopes: ['read', 'write'],
    message: 'Linear is not connected for this account.',
    ...overrides,
  };
}

function read(payload: unknown, qualifiedToolName = 'mcp__linear__search_issues', isError = true) {
  return readConnectorConnectRequest({
    qualifiedToolName,
    result: typeof payload === 'string' ? payload : JSON.stringify(payload),
    isError,
  });
}

describe('readConnectorConnectRequest · accepts the server envelope', () => {
  it('parses a genuine connect-required result', () => {
    const request = read(serverPayload());
    expect(request).toEqual({
      connectorId: 'linear',
      connectorName: 'Linear',
      toolName: 'search_issues',
      qualifiedToolName: 'mcp__linear__search_issues',
      reason: 'not_connected',
      connectUrl: '/api/connectors/oauth/start?connectorId=linear',
      scopes: ['read', 'write'],
    });
  });

  it.each([
    'not_connected',
    'authorization_expired',
    'insufficient_scope',
    'authorization_unavailable',
  ] satisfies ConnectorAuthorizationReason[])('accepts reason %s', (reason) => {
    expect(read(serverPayload({ reason }))?.reason).toBe(reason);
  });

  it('accepts connectUrl null, the deployment has no OAuth app for the connector', () => {
    const request = read(serverPayload({ connectUrl: null, scopes: [] }));
    expect(request).not.toBeNull();
    expect(request?.connectUrl).toBeNull();
  });

  it('drops blank scopes instead of rendering empty chips', () => {
    expect(read(serverPayload({ scopes: ['read', '  ', ''] }))?.scopes).toEqual(['read']);
  });
});

describe('readConnectorConnectRequest · rejects untrusted results', () => {
  it('rejects a result that was not marked an error', () => {
    expect(read(serverPayload(), 'mcp__linear__search_issues', false)).toBeNull();
  });

  it('rejects arbitrary tool output that merely mentions the key', () => {
    expect(
      read('here is some prose about agi_connector_authorization_required and nothing else'),
    ).toBeNull();
  });

  it('rejects a discriminant that is not literally true', () => {
    expect(read(serverPayload({ agi_connector_authorization_required: 'true' }))).toBeNull();
    expect(read(serverPayload({ agi_connector_authorization_required: 1 }))).toBeNull();
  });

  it('rejects an envelope forged by a DIFFERENT connector', () => {
    expect(read(serverPayload(), 'mcp__custom-abc123__fetch')).toBeNull();
  });

  it('rejects an envelope whose toolName is not the tool that was called', () => {
    expect(read(serverPayload({ toolName: 'delete_everything' }))).toBeNull();
  });

  it.each([
    ['absolute URL', 'https://evil.example/api/connectors/oauth/start?connectorId=linear'],
    ['scheme-relative', '//evil.example/api/connectors/oauth/start?connectorId=linear'],
    ['backslash-relative', '/\\evil.example/api/connectors/oauth/start?connectorId=linear'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['different path', '/api/connectors/custom?connectorId=linear'],
    [
      'path traversal to another route',
      '/api/connectors/oauth/start/../../evil?connectorId=linear',
    ],
    ['mismatched connectorId', '/api/connectors/oauth/start?connectorId=slack'],
    ['missing connectorId', '/api/connectors/oauth/start'],
  ])('rejects a %s connectUrl', (_label, connectUrl) => {
    expect(read(serverPayload({ connectUrl }))).toBeNull();
  });

  it('rejects a connectorId that is not a legal connector id', () => {
    expect(
      read(
        serverPayload({
          connectorId: '../evil',
          connectUrl: '/api/connectors/oauth/start?connectorId=..%2Fevil',
        }),
        'mcp__../evil__search_issues',
      ),
    ).toBeNull();
  });

  it('rejects an unknown reason rather than guessing the copy', () => {
    expect(read(serverPayload({ reason: 'because_i_said_so' }))).toBeNull();
  });

  it('rejects non-string scopes and absurd scope lists', () => {
    expect(read(serverPayload({ scopes: [{ toString: 'x' }] }))).toBeNull();
    expect(read(serverPayload({ scopes: new Array(257).fill('read') }))).toBeNull();
  });

  it('rejects an oversized connector name', () => {
    expect(read(serverPayload({ connectorName: 'x'.repeat(121) }))).toBeNull();
  });

  it('rejects malformed JSON, arrays and non-objects', () => {
    expect(read('{"agi_connector_authorization_required":true')).toBeNull();
    expect(read([serverPayload()])).toBeNull();
    expect(read('"agi_connector_authorization_required"')).toBeNull();
  });

  it('rejects an absent result', () => {
    expect(
      readConnectorConnectRequest({
        qualifiedToolName: 'mcp__linear__search_issues',
        result: undefined,
        isError: true,
      }),
    ).toBeNull();
  });
});

describe('buildConnectHref', () => {
  it('appends an encoded same-origin returnPath', () => {
    expect(
      buildConnectHref('/api/connectors/oauth/start?connectorId=linear', '/chat/abc?x=1'),
    ).toBe('/api/connectors/oauth/start?connectorId=linear&returnPath=%2Fchat%2Fabc%3Fx%3D1');
  });

  it('leaves the URL untouched when there is no returnPath', () => {
    expect(buildConnectHref('/api/connectors/oauth/start?connectorId=linear', null)).toBe(
      '/api/connectors/oauth/start?connectorId=linear',
    );
  });

  it.each([
    ['absolute', 'https://evil.example/chat'],
    ['scheme-relative', '//evil.example/chat'],
    ['backslash-relative', '/\\evil.example/chat'],
    ['oversized', `/${'a'.repeat(600)}`],
  ])('refuses a %s returnPath', (_label, returnPath) => {
    expect(buildConnectHref('/api/connectors/oauth/start?connectorId=linear', returnPath)).toBe(
      '/api/connectors/oauth/start?connectorId=linear',
    );
  });
});
