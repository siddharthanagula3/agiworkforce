import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PROVIDER_DISPLAY, type ProviderId } from '../design-system/provider-display';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const RUST_MIRROR_PATH = join(REPO_ROOT, 'apps/cli/src/design_system.rs');

const RUST_VARIANT_BY_ID: Readonly<Record<ProviderId, string>> = Object.freeze({
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'XAI',
  deepseek: 'DeepSeek',
  perplexity: 'Perplexity',
  qwen: 'Qwen',
  moonshot: 'Moonshot',
  minimax: 'MiniMax',
  zhipu: 'Zhipu',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  lmstudio: 'LMStudio',
  'custom-openai-compatible': 'CustomOpenAICompatible',
  'agi-cloud': 'AGICloud',
});

interface RustProviderDisplay {
  label: string;
  brandColor: string;
  isLocal: boolean;
  supportsEffort: boolean;
}

function readRustTable(source: string): Map<string, RustProviderDisplay> {
  const table = new Map<string, RustProviderDisplay>();
  const arm =
    /ProviderId::(\w+) => ProviderDisplay \{\s*id,\s*label: "([^"]*)",\s*brand_color: "([^"]*)",\s*is_local: (true|false),\s*supports_effort: (true|false),\s*\}/g;
  for (const match of source.matchAll(arm)) {
    table.set(match[1]!, {
      label: match[2]!,
      brandColor: match[3]!,
      isLocal: match[4] === 'true',
      supportsEffort: match[5] === 'true',
    });
  }
  return table;
}

function readRustOrder(source: string): string[] {
  const list = source.match(/pub const ALL: &'static \[ProviderId\] = &\[([\s\S]*?)\];/);
  expect(list, `ProviderId::ALL must be declared in ${RUST_MIRROR_PATH}`).toBeTruthy();
  return [...list![1]!.matchAll(/ProviderId::(\w+)/g)].map((match) => match[1]!);
}

describe('the CLI mirror of the provider display table', () => {
  const rust = readFileSync(RUST_MIRROR_PATH, 'utf8');
  const rustTable = readRustTable(rust);
  const rustOrder = readRustOrder(rust);
  const ids = Object.keys(PROVIDER_DISPLAY) as ProviderId[];

  it('names the same providers in the same order', () => {
    expect(rustOrder).toEqual(ids.map((id) => RUST_VARIANT_BY_ID[id]));
  });

  it.each(ids)('describes %s the same way', (id) => {
    const entry = PROVIDER_DISPLAY[id];
    const mirrored = rustTable.get(RUST_VARIANT_BY_ID[id]);
    expect(mirrored, `${RUST_VARIANT_BY_ID[id]} must have a provider_display arm`).toBeTruthy();
    expect(mirrored).toEqual({
      label: entry.label,
      brandColor: entry.brandColor,
      isLocal: entry.isLocal,
      supportsEffort: entry.supportsEffort,
    });
  });

  it('carries no provider the table does not know', () => {
    expect([...rustTable.keys()].sort()).toEqual(Object.values(RUST_VARIANT_BY_ID).sort());
  });
});
