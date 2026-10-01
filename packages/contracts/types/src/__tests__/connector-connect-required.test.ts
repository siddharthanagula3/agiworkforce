import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_AUTHORIZATION_REQUIRED_KEY,
  CONNECTOR_OAUTH_START_PATH,
  buildConnectHref,
  readConnectorConnectRequest,
} from '../connector-connect-required';

const envelope = {
  [CONNECTOR_AUTHORIZATION_REQUIRED_KEY]: true,
  connectorId: 'fixture',
  connectorName: 'Fixture connector',
  toolName: 'read_item',
  reason: 'insufficient_scope',
  connectUrl: `${CONNECTOR_OAUTH_START_PATH}?connectorId=fixture`,
  scopes: [' read:item ', '', '  '],
};
const read = (value: unknown, qualifiedToolName = 'mcp__fixture__read_item', isError = true) =>
  readConnectorConnectRequest({ qualifiedToolName, isError, result: JSON.stringify(value) });

describe('connector authorization request boundary', () => {
  it('requires a failed result from the exact qualified connector tool', () => {
    expect(read(envelope)).toEqual({
      connectorId: 'fixture',
      connectorName: 'Fixture connector',
      toolName: 'read_item',
      qualifiedToolName: 'mcp__fixture__read_item',
      reason: 'insufficient_scope',
      connectUrl: envelope.connectUrl,
      scopes: ['read:item'],
    });
    expect(read(envelope, 'mcp__other__read_item')).toBeNull();
    expect(read(envelope, 'mcp__fixture__write_item')).toBeNull();
    expect(read(envelope, undefined, false)).toBeNull();
    expect(
      readConnectorConnectRequest({
        qualifiedToolName: 'mcp__fixture__read_item',
        isError: true,
        result: undefined,
      }),
    ).toBeNull();
    expect(
      readConnectorConnectRequest({
        qualifiedToolName: 'mcp__fixture__read_item',
        isError: true,
        result: CONNECTOR_AUTHORIZATION_REQUIRED_KEY,
      }),
    ).toBeNull();
  });

  it.each(
    [
      null,
      [],
      {},
      { ...envelope, [CONNECTOR_AUTHORIZATION_REQUIRED_KEY]: 'true' },
      { ...envelope, connectorId: '../fixture' },
      { ...envelope, toolName: '' },
      { ...envelope, connectorName: '' },
      { ...envelope, connectorName: 'x'.repeat(121) },
      { ...envelope, reason: false },
      { ...envelope, reason: 'authorized' },
      { ...envelope, scopes: 'read:item' },
      { ...envelope, scopes: [1] },
      { ...envelope, scopes: ['x'.repeat(513)] },
      { ...envelope, scopes: Array(257).fill('read:item') },
    ].map((value) => [value]),
  )('refuses a malformed authorization envelope %#', (value) => {
    expect(read(value)).toBeNull();
  });

  it.each([
    'https://fixture.invalid/api/connectors/oauth/start?connectorId=fixture',
    '//fixture.invalid/path',
    '/\\fixture.invalid/path',
    '/api/connectors/oauth/other?connectorId=fixture',
    `${CONNECTOR_OAUTH_START_PATH}?connectorId=other`,
    'x'.repeat(2049),
    1,
  ])('refuses an untrusted authorization URL %#', (connectUrl) => {
    expect(read({ ...envelope, connectUrl })).toBeNull();
  });

  it('does not invent an authorization link or scopes when the host supplies none', () => {
    expect(read({ ...envelope, connectUrl: null, scopes: undefined })).toMatchObject({
      connectUrl: null,
      scopes: [],
    });
    expect(read({ ...envelope, connectUrl: undefined })).toMatchObject({ connectUrl: null });
  });

  it('adds only bounded same-origin return paths with encoded query values', () => {
    expect(buildConnectHref(envelope.connectUrl, '/chat?title=A&B')).toBe(
      `${envelope.connectUrl}&returnPath=%2Fchat%3Ftitle%3DA%26B`,
    );
    expect(buildConnectHref(CONNECTOR_OAUTH_START_PATH, '/chat')).toBe(
      `${CONNECTOR_OAUTH_START_PATH}?returnPath=%2Fchat`,
    );
    for (const path of [
      null,
      '//fixture.invalid',
      '/\\fixture.invalid',
      'https://fixture.invalid',
      '/' + 'x'.repeat(512),
    ])
      expect(buildConnectHref(envelope.connectUrl, path)).toBe(envelope.connectUrl);
  });
});
