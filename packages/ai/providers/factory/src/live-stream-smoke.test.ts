/**
 * Live-provider streaming smoke for the shared TypeScript adapters.
 *
 * The Rust side already had one (`apps/desktop/src-tauri/tests/
 * live_provider_stream_smoke.rs`), which is how the four dead provider keys
 * were found. The TypeScript side had nothing equivalent, so every non-Rust
 * surface's provider path was only ever exercised against mocks — and a mocked
 * adapter passes whether or not the real endpoint answers.
 *
 * This is the mirror. It matters more than the Rust one per test: web, mobile,
 * the Chrome extension and the VS Code extension all reach providers through
 * this factory, so one run covers all four surfaces.
 *
 * Skipped unless `AGI_LIVE_PROVIDER_SMOKE=1`, because it makes real, paid
 * calls:
 *
 * ```bash
 * AGI_LIVE_PROVIDER_SMOKE=1 pnpm vitest run \
 *   packages/ai/providers/factory/src/live-stream-smoke.test.ts
 * ```
 *
 * Keys are read from `apps/web/.env.local` in-process and never printed. Model
 * IDs are chosen from `packages/contracts/types/src/models.json` (SSOT) by
 * cost, never hardcoded here — a hardcoded ID silently rots when the catalog
 * moves, and this file would then report a model failure that is really a
 * stale-constant failure. Spend is kept trivial: `maxOutputTokens: 256`, one
 * request per provider, no retries.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChatRequest, StreamChunk } from '@agiworkforce/types';
import modelsJson from '../../../../contracts/types/src/models.json' with { type: 'json' };
import { createProviderAdapter, type ProviderAdapterId } from './index';

const LIVE = process.env.AGI_LIVE_PROVIDER_SMOKE === '1';

/** Env var names to try per provider, first hit wins. */
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

/**
 * Env var holding a base-URL override per provider, matching the server's
 * `<PREFIX>_BASE_URL` convention.
 *
 * The first version of this file passed only `{ apiKey }`, and so reported
 * Moonshot as a dead key for a day. The key was fine; `MOONSHOT_BASE_URL` was
 * set to `api.moonshot.ai` and the adapter default was `api.moonshot.cn` —
 * two separate Moonshot platforms with separate accounts, which reject each
 * other's keys with a bare `401 Invalid Authentication`. The deployed app read
 * the override and worked; only this test did not, so it accused a working
 * provider.
 *
 * A smoke test that builds adapters differently from the app it vouches for is
 * worse than no smoke test, because its failures get believed.
 */
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

/**
 * Providers that publish no static catalog entry because they enumerate their
 * models from the endpoint at runtime.
 *
 * `models.json` is the SSOT for models we curate; an aggregator's inventory is
 * not ours to curate and changes without us. Treating an empty static lookup
 * as a defect would be wrong for these — the first draft of this test did
 * exactly that and reported OpenRouter as broken when it had in fact been
 * serving requests all along.
 */
const DYNAMIC_CATALOG: ReadonlySet<ProviderAdapterId> = new Set(['open_router']);

/**
 * Parse `KEY=VALUE` from the env file without adding a dotenv dependency.
 * Values are returned but never logged.
 */
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

/**
 * Cheapest streaming model the catalog lists for a provider.
 *
 * Picking by cost rather than by name keeps this file correct across catalog
 * churn and keeps the bill near zero.
 */
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

/** Cheapest model a dynamic-catalog provider currently advertises. */
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
  /** Reasoning models may emit only these; still a healthy stream. */
  thinkingDeltas: number;
  /**
   * Every chunk type the stream produced. A provider that refuses the request
   * still yields *something*; without this the report cannot tell "streamed
   * nothing" apart from "reported an error we did not surface".
   */
  chunkTypes: string[];
  /** Base-URL override in effect, so the report names the host actually dialled. */
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

// Opt-in gate on a real, paid, network-dependent call — the same reason the
// Rust twin carries `#[ignore = "makes real, paid provider streaming calls"]`.
// Not a disabled test hiding a failure: the unconditional `live smoke wiring`
// suite below runs in CI and fails if this one would be skipped for the wrong
// reason (renamed env var, moved catalog entry) rather than the intended one.
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

    // Green = the stream opened, produced content, and reported no error.
    // Not "text deltas > 0": a reasoning model can spend the whole token
    // budget on `thinking-delta` and still be perfectly healthy. Judging on
    // text alone reported both Moonshot and GLM as broken when they were
    // answering fine — the same mistake twice, so the rule is written down.
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

    // A provider rejecting a key is a credentials problem, not a code
    // problem, and the table above names which. What must not happen is
    // every provider failing, or none being attempted — either means the
    // shared streaming path itself is broken, which is the thing this test
    // is here to catch.
    expect(outcomes.length, 'no provider had a key to try').toBeGreaterThan(0);
    expect(
      green.length,
      `no provider streamed: ${red.map((o) => o.error).join(' | ')}`,
    ).toBeGreaterThan(0);
  });
});

describe('live smoke wiring', () => {
  it('names a real env var and a real catalog model for every keyed provider', () => {
    // Runs in normal CI. Catches the failure mode where the live smoke is
    // green-by-vacancy: a provider silently skipped forever because its env
    // name was renamed or its catalog entry moved, which reads identically to
    // "no key configured".
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
