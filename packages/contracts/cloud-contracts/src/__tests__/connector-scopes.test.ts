import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_OAUTH_SCOPE_CEILINGS,
  SCOPE_REVIEW_PENDING,
  describeConnectorScope,
  describeGrantedConnectorScopes,
  getConnectorScopeDescriptions,
  summarizeConnectorScopes,
} from '../index';

describe('connector scope tables from the package root', () => {
  it('describes every scope an enforced ceiling admits', () => {
    for (const [connectorId, ceiling] of Object.entries(CONNECTOR_OAUTH_SCOPE_CEILINGS)) {
      if (ceiling === SCOPE_REVIEW_PENDING) continue;
      for (const scope of ceiling) {
        expect(describeConnectorScope(scope), `${connectorId}: ${scope}`).not.toBeNull();
      }
    }
  });

  it('gives the sentences for a known ceiling, and says when a ceiling is pending or absent', () => {
    const gmail = getConnectorScopeDescriptions('gmail');
    expect(gmail.status).toBe('known');
    if (gmail.status === 'known') {
      expect(gmail.entries.map((entry) => entry.sentence)).toContain(
        'Sends email from your Gmail account.',
      );
    }
    expect(getConnectorScopeDescriptions('airtable')).toEqual({ status: 'pending' });
    expect(getConnectorScopeDescriptions('not-a-connector')).toEqual({ status: 'none' });
    expect(summarizeConnectorScopes('gmail')?.writeCount).toBeGreaterThan(0);
  });

  it('describes a granted Google scope in its fully qualified form', () => {
    expect(
      describeGrantedConnectorScopes(['https://www.googleapis.com/auth/gmail.readonly']),
    ).toEqual([
      {
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        sentence: 'Reads your Gmail messages and attachments.',
        access: 'read',
      },
    ]);
  });
});
