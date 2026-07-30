/**
 * Regression: Android intent filters (share sheet, selected text, App Links).
 *
 * Expo prebuild prefixes `android.intent.action.` / `android.intent.category.`
 * onto intentFilters names itself. app.config.js previously passed
 * fully-qualified names, so the generated AndroidManifest.xml contained
 * doubled names (`android.intent.action.android.intent.action.SEND`), which
 * match no real intent — the share-sheet target and the autoVerify App Link
 * were both dead. Android native output is generated and gitignored, so this
 * test pins the authoritative app.config.js inputs that Expo prebuild consumes.
 *
 * Also pinned:
 *  - SEND advertises text/plain only (there is no image-share ingestion path;
 *    advertising image/* would be fake availability).
 *  - PROCESS_TEXT (selected-text action) is declared — MainActivity.kt
 *    rewrites it onto the agiworkforce://intent/share deep link.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    android: {
      intentFilters: Array<{
        action: string;
        autoVerify?: boolean;
        category?: string[];
        data?: Array<{ mimeType?: string; scheme?: string; host?: string }>;
      }>;
    };
  };
};

const filters = appConfig.expo.android.intentFilters;

describe('app.config.js — Android intentFilters use Expo short names', () => {
  it('never uses fully-qualified action/category names (prebuild adds the prefix)', () => {
    for (const filter of filters) {
      expect(filter.action).not.toMatch(/^android\.intent\./);
      for (const category of filter.category ?? []) {
        expect(category).not.toMatch(/^android\.intent\./);
      }
    }
  });

  it('declares a text/plain-only SEND share target (no image/* — no ingestion path exists)', () => {
    const send = filters.find((f) => f.action === 'SEND');
    expect(send).toBeDefined();
    expect(send!.category).toEqual(['DEFAULT']);
    expect(send!.data?.map((d) => d.mimeType)).toEqual(['text/plain']);
  });

  it('declares a text/plain PROCESS_TEXT selected-text action', () => {
    const processText = filters.find((f) => f.action === 'PROCESS_TEXT');
    expect(processText).toBeDefined();
    expect(processText!.category).toEqual(['DEFAULT']);
    expect(processText!.data?.map((d) => d.mimeType)).toEqual(['text/plain']);
  });

  it('declares the autoVerify VIEW App Link only for the canonical apex host', () => {
    const view = filters.find((f) => f.action === 'VIEW');
    expect(view).toBeDefined();
    expect(view!.autoVerify).toBe(true);
    expect(view!.category).toEqual(expect.arrayContaining(['DEFAULT', 'BROWSABLE']));
    expect(view!.data?.map((d) => d.host)).toEqual(['agiworkforce.com']);
  });
});
