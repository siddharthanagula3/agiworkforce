/**
 * The desktop shell translates through the shared `@agiworkforce/i18n` corpus,
 * while `apps/desktop/src/i18n/locales/` is an unloaded legacy copy. Keys added
 * only to the legacy copy render as raw `sidebar.noConversations`-style text in
 * the running app (found by the native WDIO run on 2026-08-01). This test walks
 * every literal `t('…')` key in the v3 feature components and asserts the
 * shared English corpus can resolve it, so the two corpora cannot drift again.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resources } from '@agiworkforce/i18n';

const V3_FEATURES_DIR = join(__dirname, '..', '..', 'features', 'v3');

function flattenKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('v3 namespace corpus coverage', () => {
  const corpus = resources as Record<string, Record<string, unknown>>;
  const enV3 = new Set(flattenKeys(corpus['en']?.['v3'] ?? {}));

  it('resolves every literal t() key used by v3 feature components', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(V3_FEATURES_DIR)) {
      const source = readFileSync(file, 'utf8');
      // Only components translating the v3 namespace are in scope.
      if (!source.includes("useTranslation('v3')")) continue;
      // Literal keys: t('a.b.c'), plus quoted dotted keys inside conditional
      // expressions passed to t(cond ? 'a.b' : 'c.d').
      const keys: string[] = [
        ...[...source.matchAll(/\bt\(\s*'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+)+)'/g)].map(
          (m) => m[1] as string,
        ),
        ...[
          ...source.matchAll(
            /\?\s*'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+)+)'\s*:\s*'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+)+)'/g,
          ),
        ].flatMap((m) => [m[1] as string, m[2] as string]),
      ];
      for (const key of keys) {
        // Conditional-expression capture can pick up non-i18n dotted literals;
        // only treat it as a key when its top-level group exists in the corpus.
        const topLevel = key.split('.')[0] ?? '';
        const fromConditional = !source.includes(`t('${key}'`);
        if (fromConditional && ![...enV3].some((k) => k.startsWith(`${topLevel}.`))) continue;
        if (!enV3.has(key)) missing.push(`${key} (${file.split('/features/')[1] ?? file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the keys the 2026-08-01 native run saw rendered raw', () => {
    for (const key of [
      'sidebar.noConversations',
      'sidebar.showArchived',
      'sidebar.noArchived',
      'sidebar.showActive',
      'sidebar.archived',
      'sidebar.actions.restore',
      'sidebar.actions.deletePermanently',
      'sidebar.actions.confirmDeletePermanently',
      'agiWork.artifacts.emptyTitle',
      'agiWork.artifacts.startChat',
      'agiWork.scheduled.emptyTitle',
    ]) {
      expect(enV3.has(key), `shared en v3 corpus is missing ${key}`).toBe(true);
    }
  });
});
