#!/usr/bin/env node
/**
 * Ask every registered model whether it still answers.
 *
 * One minimal request per model per run, through the model's own default route
 * and its real provider adapter, so what the probe measures is the path the
 * product dispatches on rather than a hand-rolled HTTP call beside it. The
 * model set, the route and the credential all come from the compiled registry
 * and each adapter's declared auth: no model id, provider id or endpoint is
 * written here.
 *
 * Writes a probe record per model. With `--advance`, a model that answers moves
 * from `registered` to `probed` in the curation catalog; nothing else about the
 * catalog is touched.
 */

import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import prettier from 'prettier';

import {
  LIFECYCLE_STAGE,
  isAllowedStageTransition,
  stageAtOrAfter,
} from '../packages/ai/model-registry/scripts/lifecycle-stages.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const REGISTRY_JSON = path.join(REPO_ROOT, 'packages/ai/model-registry/generated/registry.json');
const CURATION_JSON = path.join(
  REPO_ROOT,
  'packages/ai/model-registry/catalog/models.curation.json',
);
export const PROBES_JSON = path.join(REPO_ROOT, 'packages/ai/model-registry/catalog/probes.json');

/**
 * The smallest request the wire allows: one short user turn, one output token,
 * no tools, no sampling. Enough to prove the route answers and to time the
 * first byte, not enough to be worth caching or to cost anything meaningful.
 */
export const PROBE_PROMPT = 'ping';
export const PROBE_MAX_OUTPUT_TOKENS = 1;
export const PROBE_TIMEOUT_MS = 30_000;
export const PROBE_SCHEMA_VERSION = 1;

const TEXT_OUTPUT_CAPABILITY = 'textOutput';
const API_KEY_AUTH_KIND = 'api-key';
const LIVE_AVAILABILITY = 'live';
const RESPONSE_META_CHUNK = 'response-meta';
const ERROR_CHUNK = 'error';
const UNKNOWN_ECHO = null;

export const PROBE_OUTCOME = {
  answered: 'answered',
  failed: 'failed',
  noCredential: 'no_credential',
  unprobeable: 'unprobeable',
};

/**
 * A placeholder passed only so an adapter can be constructed far enough to read
 * its own declared auth methods. Several SDK clients refuse to instantiate
 * without one. It never reaches a request: the adapter built with it is
 * discarded, and the dispatching adapter is rebuilt with the real credential.
 */
const AUTH_DISCOVERY_PLACEHOLDER = 'auth-discovery-placeholder';

const OUT_FLAG = '--out';
const ADVANCE_FLAG = '--advance';
const REQUIRE_PROMOTED_FLAG = '--require-promoted';

/**
 * Loaded on demand rather than imported at module scope: the adapter packages
 * pull in every provider SDK, and a test that injects a fake factory must be
 * able to import this module without any of that.
 */
export async function loadProviderAdapters() {
  const factory = await import('../packages/ai/providers/factory/src/index.ts');
  return {
    create: factory.createProviderAdapter,
    isKnownProvider: factory.isProviderAdapterId,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function today(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * One entry per model, never per route: the cap on spend is structural rather
 * than a counter someone can forget to decrement. The default route is the one
 * the product dispatches on when nothing else applies, so it is the honest
 * thing to measure.
 */
export function buildProbePlan(registry) {
  const plan = [];
  for (const [modelKey, model] of Object.entries(registry.models)) {
    if (registry.capabilities[modelKey]?.[TEXT_OUTPUT_CAPABILITY] !== true) continue;
    if (model.lifecycle.availability !== LIVE_AVAILABILITY) continue;
    if (model.lifecycle.deprecated) continue;
    if (!stageAtOrAfter(model.lifecycle.stage, LIFECYCLE_STAGE.registered)) continue;
    const entry = Object.entries(registry.routes).find(
      ([, route]) => route.modelKey === modelKey && route.isDefault,
    );
    if (!entry) continue;
    const [routeId, route] = entry;
    plan.push({
      modelKey,
      routeId,
      provider: route.provider,
      providerModelId: route.providerModelId,
      harnessId: route.harnessId,
      stage: model.lifecycle.stage,
    });
  }
  return plan.sort((left, right) => (left.modelKey < right.modelKey ? -1 : 1));
}

function credentialEnvNames(adapter) {
  return adapter.auth
    .filter((method) => method.kind === API_KEY_AUTH_KIND && typeof method.envVar === 'string')
    .map((method) => method.envVar);
}

function firstPresent(env, names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim().length > 0) return { name, value };
  }
  return undefined;
}

async function probeOne(entry, options) {
  const { env, adapters, now, timeoutMs } = options;
  if (!adapters.isKnownProvider(entry.provider)) {
    return {
      outcome: PROBE_OUTCOME.unprobeable,
      detail: `no adapter is constructible for harness ${entry.harnessId}`,
    };
  }

  let envNames;
  try {
    envNames = credentialEnvNames(
      adapters.create(entry.provider, { apiKey: AUTH_DISCOVERY_PLACEHOLDER }),
    );
  } catch (error) {
    return {
      outcome: PROBE_OUTCOME.unprobeable,
      detail: `adapter ${entry.provider} could not be constructed: ${String(error?.message ?? error)}`,
    };
  }
  const credential = firstPresent(env, envNames);
  if (!credential) {
    return {
      outcome: PROBE_OUTCOME.noCredential,
      detail: `no value for ${envNames.join(' or ') || 'any declared credential'}`,
    };
  }

  const adapter = adapters.create(entry.provider, { apiKey: credential.value });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();
  let ttfbMs;
  let echoedModelId = UNKNOWN_ECHO;
  try {
    for await (const chunk of adapter.stream(
      {
        model: entry.providerModelId,
        messages: [{ role: 'user', content: PROBE_PROMPT }],
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      },
      controller.signal,
    )) {
      ttfbMs ??= Math.round(now() - startedAt);
      if (chunk.type === RESPONSE_META_CHUNK && typeof chunk.model === 'string') {
        echoedModelId = chunk.model;
      }
      if (chunk.type === ERROR_CHUNK) {
        return { outcome: PROBE_OUTCOME.failed, detail: chunk.message, ttfbMs };
      }
    }
  } catch (error) {
    return { outcome: PROBE_OUTCOME.failed, detail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }

  if (ttfbMs === undefined) {
    return { outcome: PROBE_OUTCOME.failed, detail: 'the route answered with no chunks' };
  }
  return { outcome: PROBE_OUTCOME.answered, ttfbMs, echoedModelId };
}

export async function runProbes(registry, options) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const adapters = options.adapters ?? (await loadProviderAdapters());
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const probedOn = today(options.runAt ?? Date.now());

  const probes = {};
  for (const entry of buildProbePlan(registry)) {
    const result = await probeOne(entry, { env, adapters, now, timeoutMs });
    probes[entry.modelKey] = {
      routeId: entry.routeId,
      probedOn,
      outcome: result.outcome,
      ttfbMs: result.ttfbMs ?? null,
      echoedModelId: result.echoedModelId ?? UNKNOWN_ECHO,
      detail: result.detail ?? null,
    };
  }
  return { schemaVersion: PROBE_SCHEMA_VERSION, lastRunOn: probedOn, probes };
}

export function answeringModelKeys(probeFile) {
  return new Set(
    Object.entries(probeFile?.probes ?? {})
      .filter(([, probe]) => probe.outcome === PROBE_OUTCOME.answered)
      .map(([modelKey]) => modelKey),
  );
}

/**
 * A promoted model that stops answering is the finding this job exists to
 * report. A model with no credential in the running environment is not: the
 * probe never asked it anything, and silence it did not cause is not evidence.
 */
export function silentPromotedModels(registry, probeFile) {
  return Object.entries(registry.models)
    .filter(([modelKey, model]) => {
      if (model.lifecycle.stage !== LIFECYCLE_STAGE.promoted) return false;
      const probe = probeFile.probes[modelKey];
      return probe !== undefined && probe.outcome === PROBE_OUTCOME.failed;
    })
    .map(([modelKey]) => modelKey);
}

export function advancedStages(curation, probeFile) {
  const advanced = [];
  for (const [modelKey, probe] of Object.entries(probeFile.probes)) {
    if (probe.outcome !== PROBE_OUTCOME.answered) continue;
    const lifecycle = curation.models[modelKey]?.lifecycle;
    if (!lifecycle) continue;
    if (!isAllowedStageTransition(lifecycle.stage, LIFECYCLE_STAGE.probed)) continue;
    advanced.push({
      modelKey,
      from: lifecycle.stage,
      to: LIFECYCLE_STAGE.probed,
      stagedOn: probe.probedOn,
      source: `${path.relative(REPO_ROOT, PROBES_JSON)}#${modelKey}`,
    });
  }
  return advanced;
}

async function writeJson(file, value) {
  const config = (await prettier.resolveConfig(file)) ?? {};
  fs.writeFileSync(
    file,
    await prettier.format(JSON.stringify(value), { ...config, parser: 'json', filepath: file }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const registry = readJson(REGISTRY_JSON);
  const outFile = argValue(args, OUT_FLAG) ?? PROBES_JSON;

  const probeFile = await runProbes(registry, {});
  await writeJson(outFile, probeFile);

  const counts = {};
  for (const probe of Object.values(probeFile.probes)) {
    counts[probe.outcome] = (counts[probe.outcome] ?? 0) + 1;
  }
  console.log(
    `[probe] ${Object.keys(probeFile.probes).length} model(s) → ${Object.entries(counts)
      .map(([outcome, count]) => `${outcome} ${count}`)
      .join(', ')}`,
  );
  console.log(`[probe] wrote ${path.relative(REPO_ROOT, outFile)}`);

  if (args.includes(ADVANCE_FLAG)) {
    const curation = readJson(CURATION_JSON);
    const advanced = advancedStages(curation, probeFile);
    for (const move of advanced) {
      curation.models[move.modelKey].lifecycle = {
        stage: move.to,
        stagedOn: move.stagedOn,
        source: move.source,
      };
      console.log(`[probe] ${move.modelKey}: ${move.from} → ${move.to}`);
    }
    if (advanced.length > 0) await writeJson(CURATION_JSON, curation);
    console.log(`[probe] advanced ${advanced.length} model(s) to ${LIFECYCLE_STAGE.probed}`);
  }

  if (args.includes(REQUIRE_PROMOTED_FLAG)) {
    const silent = silentPromotedModels(registry, probeFile);
    if (silent.length > 0) {
      console.error(
        `[probe] ✗ ${silent.length} promoted model(s) stopped answering: ${silent.join(', ')}`,
      );
      process.exitCode = 1;
    }
  }
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error('[probe] fatal:', error);
    process.exitCode = 1;
  });
}
