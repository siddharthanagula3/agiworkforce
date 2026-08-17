import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type Json = Record<string, unknown>;

const readJson = (relativePath: string): Json =>
  JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as Json;

const mergePatch = (target: unknown, patch: unknown): unknown => {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const merged: Json =
    target && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Json) } : {};
  for (const [key, value] of Object.entries(patch as Json)) {
    if (value === null) delete merged[key];
    else merged[key] = mergePatch(merged[key], value);
  }
  return merged;
};

const overridePaths = (script: string) =>
  [...script.matchAll(/(?:--config|-c)[=\s]+(\S+)/g)]
    .map((match) => match[1] as string)
    .filter((candidate) => !candidate.startsWith('{'));

const patternOf = (config: unknown) =>
  (config as { app?: { security?: { pattern?: { use?: string } } } }).app?.security?.pattern;

const productConfig = readJson('src-tauri/tauri.conf.json');
const scripts = (readJson('package.json') as { scripts: Record<string, string> }).scripts;
const devUrl = (productConfig as { build?: { devUrl?: string } }).build?.devUrl ?? '';

const mergedDevConfig = overridePaths(scripts['dev'] ?? '').reduce<unknown>((config, path) => {
  expect(existsSync(resolve(process.cwd(), path))).toBe(true);
  return mergePatch(config, readJson(path));
}, productConfig);

describe('tauri dev loop vs the isolation pattern', () => {
  it('never pairs an http dev url with the isolation pattern', () => {
    if (/^https?:/i.test(devUrl)) {
      expect(patternOf(mergedDevConfig)?.use ?? 'brownfield').toBe('brownfield');
    } else {
      expect(devUrl).toMatch(/^\w+:/);
    }
  });

  it('drops the isolation options so the merged dev pattern still deserializes', () => {
    expect(patternOf(mergedDevConfig)).toEqual({ use: 'brownfield' });
  });

  it('keeps the isolation pattern for packaged and e2e builds', () => {
    expect(patternOf(productConfig)?.use).toBe('isolation');
    expect(scripts['build:release']).not.toMatch(/(?:--config|(?:^|\s)-c)[=\s]/);
    expect(scripts['build:local']).not.toMatch(/(?:--config|(?:^|\s)-c)[=\s]/);
    expect(scripts['test:e2e:build']).toContain('--features tauri/custom-protocol');
  });
});
