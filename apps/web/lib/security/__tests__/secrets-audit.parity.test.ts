import { describe, expect, it } from 'vitest';

import fixture from '../__fixtures__/secrets-audit-parity.json';
import { redactAuditedSecrets } from '../secrets-audit';

/** Captured from the audit before its patterns moved into the shared registry. */
describe('the secrets audit reads the shared registry and keeps its output', () => {
  it('redacts every detection rule as it did', () => {
    expect(fixture.corpus.map((text) => redactAuditedSecrets(text))).toEqual(fixture.redacted);
  });

  it('redacts only the allowed rules when given names', () => {
    const allowed = new Set(['JWT', 'Bearer Token', 'Private Key']);
    expect(fixture.corpus.map((text) => redactAuditedSecrets(text, allowed))).toEqual(
      fixture.redactedAllowing,
    );
  });
});
