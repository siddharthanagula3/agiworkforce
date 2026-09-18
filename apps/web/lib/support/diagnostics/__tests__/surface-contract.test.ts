import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_SURFACES } from '../types';
import { supportDiagnosticsSchema } from '../schema';

/**
 * Each surface asserts this same field list against its own collector. Adding a
 * field to the schema fails here first, which is the prompt to teach every
 * surface to fill it rather than to ship a bundle missing it.
 */
const BUNDLE_FIELDS = [
  'collectedAt',
  'surface',
  'appVersion',
  'releaseSha',
  'deployEnv',
  'platform',
  'locale',
  'timeZone',
  'viewport',
  'online',
  'pagePath',
  'conversationId',
  'recentEvents',
];

describe('diagnostics bundle contract', () => {
  it('is the same field list every surface collects', () => {
    expect(Object.keys(supportDiagnosticsSchema.shape).sort()).toEqual([...BUNDLE_FIELDS].sort());
  });

  it('names every surface that can export a bundle', () => {
    expect([...DIAGNOSTIC_SURFACES].sort()).toEqual([
      'cli',
      'desktop',
      'extension-chrome',
      'extension-vscode',
      'mobile',
      'web',
    ]);
  });
});
