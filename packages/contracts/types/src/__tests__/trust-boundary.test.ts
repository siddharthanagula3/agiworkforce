/**
 * Local-runtime trust-boundary contract.
 *
 * `getProviderSurface` has exactly one production consumer:
 * `apps/web/features/chat/lib/localByokHandoff.ts`, which turns a provider id
 * into a `ProviderMode` for `shouldForkLocalToByok` — the branch
 * `WebChatPage.tsx` uses to decide whether a send crosses the Local→BYOK
 * boundary and must open the consent ceremony (context selection, secret scan,
 * payload preview, consent) instead of sending.
 *
 * That consumer can only ever name the providers reachable from its own
 * `LOCAL_MODEL_PREFIXES` list. If the registry does not carry a
 * `trustModes: ['local']` harness for one of them, `getProviderSurface` falls
 * through to `hidden`, `providerSurfaceToProviderMode` returns null, the
 * conversation has no Local mode, and the ceremony silently stops firing for
 * that runtime. This test reads that list out of the shipping consumer rather
 * than restating it, so adding a prefix for an unclassified provider fails here
 * instead of quietly shipping a runtime whose Local→BYOK guard never fires.
 *
 * SCOPE, honestly stated: llama.cpp and vLLM are desktop-only runtimes. No
 * TypeScript path can produce those provider ids for `getProviderSurface`
 * (they have no registry models, no model prefixes, and no entry in the list
 * below), and the desktop classifies them local in its own code
 * (`apps/desktop/src/App.tsx`, `core/llm/llm_router.rs`). Registering local
 * harnesses for them here would add registry rows with no reader, so they are
 * deliberately not asserted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { getProviderSurface } from '../model-catalog';
import { providerSurfaceToProviderMode } from '../suite-contracts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const LOCAL_BYOK_HANDOFF = path.join(REPO_ROOT, 'apps/web/features/chat/lib/localByokHandoff.ts');

/**
 * Pulls the provider ids the web handoff path can classify as local out of its
 * own `LOCAL_MODEL_PREFIXES` literal. A prefix is a model-id prefix
 * (`'lmstudio/'`, `'lm-studio/'`, `'ollama:'`), and `inferProviderFromModelId`
 * collapses each to a provider id, so the delimiter and the spelling hyphen are
 * dropped here the same way. Asserted non-empty so a rename of the constant
 * fails loudly rather than reducing this contract to zero assertions.
 */
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
    // providerModeFromProvider() feeds shouldForkLocalToByok(); a null mode there
    // means a Local→BYOK switch skips the consent ceremony entirely.
    for (const id of readHandoffLocalProviderIds()) {
      expect(providerSurfaceToProviderMode(getProviderSurface(id)), `${id} provider mode`).toBe(
        'Local',
      );
    }
  });

  it('keeps the local surface disjoint from the funded and BYOK surfaces', () => {
    expect(getProviderSurface('ollama')).toBe('local');
    expect(getProviderSurface('lmstudio')).toBe('local');
    expect(getProviderSurface('open_router')).toBe('byok');
    expect(getProviderSurface('nvidia_nim')).toBe('byok');
    expect(getProviderSurface('openai')).toBe('managed_cloud');
  });
});
