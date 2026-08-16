import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { getProviderSurface } from '../model-catalog';
import { providerSurfaceToProviderMode } from '../suite-contracts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const LOCAL_BYOK_HANDOFF = path.join(REPO_ROOT, 'apps/web/features/chat/lib/localByokHandoff.ts');

function readHandoffLocalProviderIds(): string[] {
  const source = fs.readFileSync(LOCAL_BYOK_HANDOFF, 'utf8');
  const prefixArray = /const LOCAL_MODEL_PREFIXES = \[(.*?)\];/s.exec(source);
  expect(prefixArray, `LOCAL_MODEL_PREFIXES not found in ${LOCAL_BYOK_HANDOFF}`).not.toBeNull();
  const ids = [...prefixArray![1]!.matchAll(/'([^']+)'/g)].map((match) =>
    match[1]!.replace(/[/:]$/, '').replace(/-/g, ''),
  );
  expect(ids.length, 'LOCAL_MODEL_PREFIXES must declare at least one prefix').toBeGreaterThan(0);
  return [...new Set(ids)];
}

describe('trust boundary · local runtime classification', () => {
  it('classifies every local runtime the web handoff path can name as the local surface', () => {
    for (const id of readHandoffLocalProviderIds()) {
      expect(getProviderSurface(id), `${id} must resolve to the local surface`).toBe('local');
    }
  });

  it('maps every one of them to Local provider mode, never a null/BYOK mode', () => {
    for (const id of readHandoffLocalProviderIds()) {
      expect(providerSurfaceToProviderMode(getProviderSurface(id)), `${id} provider mode`).toBe(
        'Local',
      );
    }
  });

  it('keeps the local surface disjoint from the funded and BYOK surfaces', () => {
    expect(getProviderSurface('ollama')).toBe('local');
    expect(getProviderSurface('lmstudio')).toBe('local');
    expect(getProviderSurface('open_router')).toBe('managed_cloud');
    expect(getProviderSurface('nvidia_nim')).toBe('byok');
    expect(getProviderSurface('openai')).toBe('managed_cloud');
  });
});
