import { describe, expect, it } from 'vitest';

import {
  connectorAccountDisplayName,
  selectConnectorAccount,
  sortConnectorAccounts,
  type ConnectorAccount,
  type ConnectorAccountScope,
} from '../accounts';
import { connectorSupportsMultipleAccounts, connectorSupportsServiceAccount } from '../catalog';

function account(
  accountKey: string,
  scope: ConnectorAccountScope,
  overrides: Partial<ConnectorAccount> = {},
): ConnectorAccount {
  return {
    connectorId: 'gmail',
    accountKey,
    accountLabel: `${accountKey}@example.com`,
    scope,
    isDefault: false,
    grantedScopes: [],
    connectedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    needsReauthorization: false,
    ...overrides,
  };
}

describe('selectConnectorAccount', () => {
  it('uses the only connected account when nothing is asked for', () => {
    const selection = selectConnectorAccount([account('default', 'personal')], 'gmail');
    expect(selection.status).toBe('selected');
  });

  it('never mixes personal and work accounts of the same connector', () => {
    const accounts = [account('default', 'personal'), account('work', 'work')];

    const asWork = selectConnectorAccount(accounts, 'gmail', { scope: 'work' });
    const asPersonal = selectConnectorAccount(accounts, 'gmail', { scope: 'personal' });

    expect(asWork.status === 'selected' && asWork.account.accountKey).toBe('work');
    expect(asPersonal.status === 'selected' && asPersonal.account.accountKey).toBe('default');
  });

  it('refuses a named account whose scope is not the one asked for', () => {
    const selection = selectConnectorAccount([account('work', 'work')], 'gmail', {
      accountKey: 'work',
      scope: 'personal',
    });

    expect(selection.status).toBe('unresolved');
    if (selection.status === 'unresolved') {
      expect(selection.reason).toBe('scope-mismatch');
      expect(selection.message).toContain('Nothing was sent');
    }
  });

  it('reports ambiguity rather than picking between two accounts of one scope', () => {
    const selection = selectConnectorAccount(
      [account('one', 'work'), account('two', 'work')],
      'gmail',
    );

    expect(selection.status).toBe('unresolved');
    if (selection.status === 'unresolved') expect(selection.reason).toBe('ambiguous');
  });

  it('uses the default when several accounts are connected', () => {
    const selection = selectConnectorAccount(
      [account('one', 'work'), account('two', 'work', { isDefault: true })],
      'gmail',
    );

    expect(selection.status === 'selected' && selection.account.accountKey).toBe('two');
  });

  it('names an account that is not connected rather than falling back', () => {
    const selection = selectConnectorAccount([account('default', 'personal')], 'gmail', {
      accountKey: 'work',
    });

    expect(selection.status).toBe('unresolved');
    if (selection.status === 'unresolved') expect(selection.reason).toBe('unknown-account');
  });

  it('ignores accounts belonging to another connector', () => {
    const other = { ...account('default', 'personal'), connectorId: 'slack' };
    const selection = selectConnectorAccount([other], 'gmail');

    expect(selection.status).toBe('unresolved');
    if (selection.status === 'unresolved') expect(selection.reason).toBe('no-accounts');
  });
});

describe('connector account presentation', () => {
  it('prefers the provider label and falls back to the scope', () => {
    expect(connectorAccountDisplayName(account('work', 'work'))).toBe('work@example.com');
    expect(connectorAccountDisplayName(account('default', 'service', { accountLabel: null }))).toBe(
      'Service account',
    );
  });

  it('sorts the default first', () => {
    const sorted = sortConnectorAccounts([
      account('one', 'personal'),
      account('two', 'work', { isDefault: true }),
    ]);
    expect(sorted[0]?.accountKey).toBe('two');
  });
});

describe('catalog account capabilities', () => {
  it('allows several accounts for a provider-hosted connector and none for a device-local one', () => {
    expect(connectorSupportsMultipleAccounts('gmail')).toBe(true);
    expect(connectorSupportsMultipleAccounts('terminal')).toBe(false);
  });

  it('offers a service account only where the credential is not a person signing in', () => {
    expect(connectorSupportsServiceAccount('postgresql')).toBe(true);
    expect(connectorSupportsServiceAccount('sendgrid')).toBe(true);
    expect(connectorSupportsServiceAccount('gmail')).toBe(false);
    expect(connectorSupportsServiceAccount('terminal')).toBe(false);
  });
});
