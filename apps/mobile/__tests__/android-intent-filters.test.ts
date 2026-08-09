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

import fs from 'fs';
import path from 'path';

/**
 * The Android App Link paths must stay in step with the Apple App Site
 * Association document web serves. Both are hand-maintained lists of the same
 * claim and there is no shared source to generate them from, so this reads the
 * AASA source and derives what the Android filter has to say — rather than
 * freezing a literal, which would stay green while the two drifted apart.
 *
 * AASA component patterns map onto Android <data> attributes as:
 *   `/pair`   -> path='/pair'
 *   `/pair/*` -> pathPrefix='/pair/'
 */
const AASA_SOURCE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'web',
  'lib',
  'server',
  'mobile-app-association.ts',
);

function aasaClaimedPatterns(): string[] {
  const source = fs.readFileSync(AASA_SOURCE_PATH, 'utf8');
  const patterns = [...source.matchAll(/'\/':\s*'([^']+)'/gu)].map((match) => match[1] as string);
  // A regex that stopped matching would make the comparison below vacuous.
  expect(patterns.length).toBeGreaterThan(0);
  return patterns;
}

function androidPathAttributeFor(pattern: string): string {
  return pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    android: {
      intentFilters: Array<{
        action: string;
        autoVerify?: boolean;
        category?: string[];
        data?: Array<{
          mimeType?: string;
          scheme?: string;
          host?: string;
          path?: string;
          pathPrefix?: string;
          pathPattern?: string;
        }>;
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
    expect(view!.data?.length).toBeGreaterThan(0);
    for (const entry of view!.data ?? []) {
      expect(entry.scheme).toBe('https');
      expect(entry.host).toBe('agiworkforce.com');
    }
  });

  // Without a path filter the intent-filter claims https://agiworkforce.com/*,
  // so an installed app swallows every marketing/pricing/docs/blog tap and
  // opens on a screen that has no handler for the URL. Android matches the
  // union of the <data> path attributes, so every entry must carry one.
  it('scopes the App Link to the paths the app actually routes', () => {
    const view = filters.find((f) => f.action === 'VIEW');
    for (const entry of view!.data ?? []) {
      expect(entry.path ?? entry.pathPrefix ?? entry.pathPattern).toBeDefined();
    }

    const paths = (view!.data ?? []).map((d) => d.path ?? d.pathPrefix ?? d.pathPattern);
    // Derived from the AASA source, so adding or removing a component there
    // fails here until apps/mobile/app.config.js is updated to match.
    expect([...paths].sort()).toEqual(aasaClaimedPatterns().map(androidPathAttributeFor).sort());
  });
});
