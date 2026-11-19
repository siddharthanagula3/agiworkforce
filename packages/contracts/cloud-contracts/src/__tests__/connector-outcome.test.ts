import { describe, expect, it } from 'vitest';

import {
  classifyConnectorFailure,
  connectorOutcomeNotice,
  describeConnectorFailure,
} from '../connector-outcome';

const IDENTITY = {
  connectorId: 'gmail',
  connectorLabel: 'Gmail',
  accountLabel: 'work@example.com',
} as const;

describe('classifyConnectorFailure', () => {
  it('reads an expired or revoked grant as an authorization failure', () => {
    expect(classifyConnectorFailure({ status: 401 })).toBe('authorization');
    expect(classifyConnectorFailure({ status: 403 })).toBe('authorization');
    expect(classifyConnectorFailure({ message: 'invalid_grant: token expired' })).toBe(
      'authorization',
    );
    expect(classifyConnectorFailure({ message: 'The refresh token was revoked' })).toBe(
      'authorization',
    );
  });

  it('separates the failures a user can act on differently', () => {
    expect(classifyConnectorFailure({ status: 429 })).toBe('rate-limit');
    expect(classifyConnectorFailure({ status: 404 })).toBe('not-found');
    expect(classifyConnectorFailure({ status: 503 })).toBe('unavailable');
    expect(classifyConnectorFailure({ status: 422 })).toBe('invalid-request');
    expect(classifyConnectorFailure({ message: '' })).toBe('unknown');
  });
});

describe('connectorOutcomeNotice', () => {
  it('renders an expired connector as a reconnect state, never as an empty result', () => {
    const notice = connectorOutcomeNotice({
      ...IDENTITY,
      toolName: 'search_messages',
      failure: 'authorization',
      resultCount: 0,
    });

    expect(notice.kind).toBe('reconnect');
    expect(notice.actionLabel).toBe('Reconnect');
    expect(notice.title).toContain('Gmail (work@example.com)');
    expect(notice.detail.toLowerCase()).not.toContain('no results');
    expect(notice.detail).toContain('search_messages');
  });

  it('keeps every other failure distinct from an empty result too', () => {
    for (const failure of ['rate-limit', 'not-found', 'unavailable', 'unknown'] as const) {
      const notice = connectorOutcomeNotice({
        ...IDENTITY,
        toolName: 'search_messages',
        failure,
        resultCount: 0,
      });
      expect(notice.kind).toBe('failed');
      expect(notice.detail.toLowerCase()).not.toContain('no results');
    }
  });

  it('calls a genuinely empty answer empty, and says the connector worked', () => {
    const notice = connectorOutcomeNotice({
      ...IDENTITY,
      toolName: 'search_messages',
      failure: null,
      resultCount: 0,
    });

    expect(notice.kind).toBe('empty');
    expect(notice.actionLabel).toBeNull();
    expect(notice.detail).toContain('working');
  });
});

describe('describeConnectorFailure', () => {
  it('names the connector, the account and the tool that did not run', () => {
    const message = describeConnectorFailure({
      ...IDENTITY,
      toolName: 'send_message',
      kind: 'authorization',
      detail: 'invalid_grant',
    });

    expect(message).toContain('Gmail (work@example.com)');
    expect(message).toContain('send_message');
    expect(message).toContain('invalid_grant');
    expect(message).toContain('Reconnect');
  });
});
