import { describe, it, expect } from 'vitest';

import {
  CONNECTOR_OAUTH_SCOPE_CEILINGS,
  SCOPE_REVIEW_PENDING,
  canonicalConnectorScope,
} from '../oauth-scope-allowlist';
import { describeConnectorScope, getConnectorScopeDescriptions } from '../scope-descriptions';

describe('every allowlisted OAuth scope has a plain-language, read-or-write description', () => {
  for (const [connectorId, ceiling] of Object.entries(CONNECTOR_OAUTH_SCOPE_CEILINGS)) {
    if (ceiling === SCOPE_REVIEW_PENDING) continue;
    for (const scope of ceiling) {
      it(`${connectorId}: ${scope}`, () => {
        const description = describeConnectorScope(scope);
        expect(
          description,
          `${connectorId} scope "${scope}" (canonical "${canonicalConnectorScope(scope)}") has no entry in scope-descriptions.ts`,
        ).not.toBeNull();
        expect(['read', 'write']).toContain(description!.access);
        expect(description!.sentence.trim().length).toBeGreaterThan(0);
      });
    }
  }

  it('never falls back to the undescribed placeholder for a real connector ceiling', () => {
    for (const connectorId of Object.keys(CONNECTOR_OAUTH_SCOPE_CEILINGS)) {
      const descriptions = getConnectorScopeDescriptions(connectorId);
      if (descriptions.status !== 'known') continue;
      for (const entry of descriptions.entries) {
        expect(entry.sentence).not.toBe('This permission has not been described yet.');
      }
    }
  });
});

describe('getConnectorScopeDescriptions', () => {
  it('reports a connector outside the ceiling table as none', () => {
    expect(getConnectorScopeDescriptions('github')).toEqual({ status: 'none' });
  });

  it('reports an unreviewed provider as pending', () => {
    expect(getConnectorScopeDescriptions('calendly')).toEqual({ status: 'pending' });
  });

  it('reports a scope-less OAuth provider as known with zero entries', () => {
    expect(getConnectorScopeDescriptions('notion')).toEqual({ status: 'known', entries: [] });
  });

  it('classifies a write scope and a read scope correctly for a real connector', () => {
    const descriptions = getConnectorScopeDescriptions('gmail');
    expect(descriptions.status).toBe('known');
    if (descriptions.status !== 'known') return;
    const send = descriptions.entries.find((entry) => entry.scope.endsWith('gmail.send'));
    const readonly = descriptions.entries.find((entry) => entry.scope.endsWith('gmail.readonly'));
    expect(send?.access).toBe('write');
    expect(readonly?.access).toBe('read');
  });
});
