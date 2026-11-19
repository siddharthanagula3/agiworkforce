import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getLocalModelCatalog } from '../catalog.js';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

type ExecutorchSources = {
  modelName: string;
  modelSource: string;
  tokenizerSource: string;
  tokenizerConfigSource: string;
};

const SOURCE_KEYS = ['modelSource', 'tokenizerSource', 'tokenizerConfigSource'] as const;
const RELEASE_TAG = /\/(resolve\/v[^/]+)\//;

const requireFromHere = createRequire(import.meta.url);
const executorchRoot = path.dirname(
  requireFromHere.resolve('react-native-executorch/package.json'),
);

function legacyConstantsModule(file: string): string {
  return pathToFileURL(path.join(executorchRoot, 'lib/module/legacy/src/constants', file)).href;
}

function isExecutorchSources(value: unknown): value is ExecutorchSources {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.modelName === 'string' &&
    SOURCE_KEYS.every((key) => typeof record[key] === 'string')
  );
}

function withoutReleaseTag(url: string): string {
  return url.replace(RELEASE_TAG, '/');
}

function releaseTagOf(url: string): string | undefined {
  return RELEASE_TAG.exec(url)?.[1];
}

describe('catalog ExecuTorch presets', () => {
  it('point at the files the installed react-native-executorch release publishes', async () => {
    const libraryUrls: Record<string, unknown> = await import(
      legacyConstantsModule('modelUrls.js')
    );
    const libraryVersions: { VERSION_TAG: string; PREVIOUS_VERSION_TAG: string } = await import(
      legacyConstantsModule('versions.js')
    );
    const libraryPresets = new Map(
      Object.values(libraryUrls)
        .filter(isExecutorchSources)
        .map((preset) => [preset.modelName, preset] as const),
    );
    const publishedTags = [libraryVersions.VERSION_TAG, libraryVersions.PREVIOUS_VERSION_TAG];

    const catalogPresets = getLocalModelCatalog().flatMap((model) =>
      model.executorchPreset ? [model.executorchPreset] : [],
    );
    expect(catalogPresets.length).toBeGreaterThan(0);

    for (const preset of catalogPresets) {
      const libraryPreset = libraryPresets.get(preset.modelName);
      expect(libraryPreset, preset.modelName).toBeDefined();
      for (const key of SOURCE_KEYS) {
        expect(withoutReleaseTag(preset[key]), `${preset.modelName} ${key}`).toBe(
          withoutReleaseTag(libraryPreset![key]),
        );
        expect(publishedTags, `${preset.modelName} ${key}`).toContain(releaseTagOf(preset[key]));
      }
    }
  });
});
