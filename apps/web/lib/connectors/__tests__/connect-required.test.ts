import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  CONNECTOR_AUTHORIZATION_REQUIRED_KEY,
  buildConnectorAuthorizationRequiredPayload,
  parseConnectorAuthorizationRequired,
  serializeConnectorAuthorizationRequired,
} from '../connect-required';
import { __resetConnectorOAuthRegistryCacheForTests } from '../oauth-registry';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
];

function configureLinear(): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
    providers: [
      {
        connectorId: 'linear',
        displayName: 'Linear',
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        mcpUrl: 'https://mcp.example.com/mcp',
        scopes: ['read'],
      },
    ],
  });
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'id';
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET'] = 'secret';
  __resetConnectorOAuthRegistryCacheForTests();
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('connector authorization-required payload', () => {
  it('offers a real start path and the provider display name when connectable', () => {
    configureLinear();

    const payload = buildConnectorAuthorizationRequiredPayload({
      connectorId: 'linear',
      toolName: 'create_issue',
      reason: 'not_connected',
    });

    expect(payload[CONNECTOR_AUTHORIZATION_REQUIRED_KEY]).toBe(true);
    expect(payload.connectorName).toBe('Linear');
    expect(payload.connectUrl).toBe('/api/connectors/oauth/start?connectorId=linear');
    expect(payload.scopes).toEqual(['read']);
    expect(payload.message).toMatch(/call this tool again/i);
  });

  it('merges a step-up challenge scope into what the card will ask for', () => {
    configureLinear();

    const payload = buildConnectorAuthorizationRequiredPayload({
      connectorId: 'linear',
      toolName: 'create_issue',
      reason: 'insufficient_scope',
      additionalScopes: ['read', 'admin'],
    });

    expect(payload.scopes).toEqual(['read', 'admin']);
  });

  it('offers NO connect button when the deployment has no OAuth app for the connector', () => {
    const payload = buildConnectorAuthorizationRequiredPayload({
      connectorId: 'notion',
      toolName: 'search',
      reason: 'not_connected',
    });

    expect(payload.connectUrl).toBeNull();
    expect(payload.message).toMatch(/cannot be connected here/i);
    expect(payload.message).toMatch(/do not retry/i);
  });

  it('round-trips through the tool-result content string', () => {
    configureLinear();
    const payload = buildConnectorAuthorizationRequiredPayload({
      connectorId: 'linear',
      toolName: 'create_issue',
      reason: 'authorization_expired',
    });

    expect(
      parseConnectorAuthorizationRequired(serializeConnectorAuthorizationRequired(payload)),
    ).toEqual(payload);
  });

  it('does not mistake ordinary tool output for a connect card', () => {
    expect(parseConnectorAuthorizationRequired('issue created')).toBeNull();
    expect(parseConnectorAuthorizationRequired('{"ok":true}')).toBeNull();
    expect(
      parseConnectorAuthorizationRequired(`not json ${CONNECTOR_AUTHORIZATION_REQUIRED_KEY}`),
    ).toBeNull();
  });
});
