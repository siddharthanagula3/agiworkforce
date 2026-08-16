
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChatRequest, StreamChunk } from '@agiworkforce/types';
import modelsJson from '../../../../contracts/types/src/models.json' with { type: 'json' };
import { createProviderAdapter, type ProviderAdapterId } from './index';

const LIVE = process.env.AGI_LIVE_PROVIDER_SMOKE === '1';

const KEY_ENVS: Partial<Record<ProviderAdapterId, readonly string[]>> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  open_router: ['OPENROUTER_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  xai: ['XAI_API_KEY'],
  zhipu: ['ZHIPU_API_KEY'],
  // lmstudio and ollama are local runtimes with no key and no guarantee of a
  // running daemon on the machine executing this. Their liveness is a device
  // check, not a credential check, so they are out of scope here.
};

const BASE_URL_ENVS: Partial<Record<ProviderAdapterId, string>> = {
  anthropic: 'ANTHROPIC_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
  google: 'GOOGLE_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  open_router: 'OPENROUTER_BASE_URL',
  perplexity: 'PERPLEXITY_BASE_URL',
  qwen: 'QWEN_BASE_URL',
  xai: 'XAI_BASE_URL',
  zhipu: 'ZHIPU_BASE_URL',
};

const DYNAMIC_CATALOG: ReadonlySet<ProviderAdapterId> = new Set(['open_router']);

function loadEnvKeys(): Map<string, string> {
  const path =
    process.env.AGI_SMOKE_ENV_FILE ??
    join(import.meta.dirname, '../../../../../apps/web/.env.local');
  const out = new Map<string, string>();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) out.set(key, value);
  }
  return out;
}

interface CatalogModel {
  id: string;
  apiModelId?: string;
  provider: string;
  inputCost?: number;
  outputCost?: number;
  capabilities?: { streaming?: boolean };
}

function cheapestModelFor(provider: string): CatalogModel | undefined {
  const models = Object.values(modelsJson.models as Record<string, CatalogModel>);
  return models
    .filter((m) => m.provider === provider && m.capabilities?.streaming !== false)
    .sort(
      (a, b) =>
        (a.inputCost ?? Infinity) +
        (a.outputCost ?? Infinity) -
        ((b.inputCost ?? Infinity) + (b.outputCost ?? Infinity)),
    )[0];
}

async function cheapestLiveModelFor(
  providerId: ProviderAdapterId,
  apiKey: string,
): Promise<CatalogModel | undefined> {
  const adapter = createProviderAdapter(providerId, { apiKey } as never);
  const listed = await adapter.catalog();
  const priced = listed
    .map((m) => ({
      id: m.id,
      provider: providerId as string,
      inputCost: m.inputCost ?? 0,
      outputCost: m.outputCost ?? 0,
    }))
    .sort((a, b) => a.inputCost + a.outputCost - (b.inputCost + b.outputCost));
  return priced[0];
}

interface Outcome {
  provider: string;
  model: string;
  opened: boolean;
  textDeltas: number;
  thinkingDeltas: number;
  chunkTypes: string[];
  baseUrl?: string;
  error?: string;
}

async function smokeOne(
  providerId: ProviderAdapterId,
  apiKey: string,
  model: CatalogModel,
  baseUrl?: string,
): Promise<Outcome> {
  const adapter = createProviderAdapter(providerId, {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  } as never);
  const request: ChatRequest = {
    model: model.apiModelId ?? model.id,
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
    maxOutputTokens: 256,
  } as ChatRequest;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  const outcome: Outcome = {
    provider: providerId,
    model: request.model,
    opened: false,
    textDeltas: 0,
    thinkingDeltas: 0,
    chunkTypes: [],
    ...(baseUrl ? { baseUrl } : {}),
  };

  try {
    for await (const chunk of adapter.stream(
      request,
      controller.signal,
    ) as AsyncIterable<StreamChunk>) {
      outcome.opened = true;
      if (!outcome.chunkTypes.includes(chunk.type)) outcome.chunkTypes.push(chunk.type);
      if (chunk.type === 'text-delta' && chunk.delta) outcome.textDeltas += 1;
      if (chunk.type === 'thinking-delta' && chunk.delta) outcome.thinkingDeltas += 1;
      const asError = chunk as { type: string; error?: unknown; message?: unknown };
      if (asError.error ?? asError.message) {
        outcome.error = String(asError.error ?? asError.message);
      }
    }
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }
  return outcome;
}

// llm-guardrail-allow: paid live-network call, gated by AGI_LIVE_PROVIDER_SMOKE
describe.skipIf(!LIVE)('live provider streaming (shared TS adapters)', () => {
  it('streams text from every provider whose key is valid', { timeout: 300_000 }, async () => {
    const env = loadEnvKeys();
    const outcomes: Outcome[] = [];
    const skipped: string[] = [];

    for (const [providerId, envNames] of Object.entries(KEY_ENVS) as [
      ProviderAdapterId,
      readonly string[],
    ][]) {
      const apiKey = envNames.map((n) => env.get(n) ?? process.env[n]).find(Boolean);
      if (!apiKey) {
        skipped.push(`${providerId} (no key)`);
        continue;
      }
      const model = DYNAMIC_CATALOG.has(providerId)
        ? await cheapestLiveModelFor(providerId, apiKey)
        : cheapestModelFor(providerId);
      if (!model) {
        skipped.push(`${providerId} (no model available)`);
        continue;
      }
      const baseUrlEnv = BASE_URL_ENVS[providerId];
      const baseUrl = baseUrlEnv ? (env.get(baseUrlEnv) ?? process.env[baseUrlEnv]) : undefined;
      outcomes.push(await smokeOne(providerId, apiKey, model, baseUrl));
    }

    const isGreen = (o: Outcome) => o.opened && !o.error && o.textDeltas + o.thinkingDeltas > 0;
    const green = outcomes.filter(isGreen);
    const red = outcomes.filter((o) => !isGreen(o));

    // eslint-disable-next-line no-console -- this test exists to report a per-provider table
    console.log(
      [
        '',
        '======== LIVE STREAMING SMOKE (shared TS adapters) ========',
        ...outcomes.map(
          (o) =>
            `[${o.provider}] model=${o.model}${o.baseUrl ? ` @ ${new URL(o.baseUrl).host}` : ''}` +
            ` opened=${o.opened} text=${o.textDeltas} thinking=${o.thinkingDeltas}` +
            ` chunks=[${o.chunkTypes.join(',')}]` +
            (o.error ? `\n    error: ${o.error}` : ''),
        ),
        ...skipped.map((s) => `[skip] ${s}`),
        `green: ${green.length}/${outcomes.length}`,
        '===========================================================',
      ].join('\n'),
    );

    expect(outcomes.length, 'no provider had a key to try').toBeGreaterThan(0);
    expect(
      green.length,
      `no provider streamed: ${red.map((o) => o.error).join(' | ')}`,
    ).toBeGreaterThan(0);
  });
});

describe('live smoke wiring', () => {
  it('names a real env var and a real catalog model for every keyed provider', () => {
    for (const [id, envNames] of Object.entries(KEY_ENVS)) {
      const providerId = id as ProviderAdapterId;
      expect(envNames.length, `${providerId} lists no env var`).toBeGreaterThan(0);
      if (DYNAMIC_CATALOG.has(providerId)) continue;
      expect(
        cheapestModelFor(providerId),
        `${providerId} has no streaming model in models.json`,
      ).toBeDefined();
    }
  });
});
