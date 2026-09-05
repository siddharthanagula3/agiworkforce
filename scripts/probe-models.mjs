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
 *
 * With `--tools`, a model that answered is asked a second question carrying one
 * trivial tool, and the record says whether the route honoured it. That is a
 * cheap second signal beside the observations the serving path records at
 * runtime: this script writes the probe file and nothing else, never the route
 * or capability health store.
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

/**
 * The tool half: one function with one required argument, asked in a way whose
 * only correct answer is a call. Nothing here names a model, a provider or an
 * endpoint, for the same reason the text probe does not.
 */
export const PROBE_TOOL_NAME = 'probe_ack';
export const PROBE_TOOL_ARGUMENT = 'acknowledged';
export const PROBE_TOOL = Object.freeze({
  name: PROBE_TOOL_NAME,
  description: 'Acknowledge this probe. Call this and nothing else.',
  inputSchema: {
    type: 'object',
    properties: { [PROBE_TOOL_ARGUMENT]: { type: 'boolean' } },
    required: [PROBE_TOOL_ARGUMENT],
    additionalProperties: false,
  },
});
export const PROBE_TOOL_PROMPT = 'Acknowledge this probe.';
export const PROBE_TOOL_CHOICE = 'required';
export const PROBE_TOOL_MAX_OUTPUT_TOKENS = 32;

export const TOOL_PROBE_OUTCOME = {
  honoured: 'honoured',
  notHonoured: 'not_honoured',
  failed: 'failed',
  skipped: 'skipped',
};

const TEXT_OUTPUT_CAPABILITY = 'textOutput';
const API_KEY_AUTH_KIND = 'api-key';
const LIVE_AVAILABILITY = 'live';
const RESPONSE_META_CHUNK = 'response-meta';
const ERROR_CHUNK = 'error';
const TOOL_USE_START_CHUNK = 'tool-use-start';
const UNKNOWN_ECHO = null;
const UNPROBED_TOOL_SUPPORT = null;

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
const TOOLS_FLAG = '--tools';

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

function resolveProbeAdapter(entry, env, adapters) {
  if (!adapters.isKnownProvider(entry.provider)) {
    return {
      failure: {
        outcome: PROBE_OUTCOME.unprobeable,
        detail: `no adapter is constructible for harness ${entry.harnessId}`,
      },
    };
  }

  let envNames;
  try {
    envNames = credentialEnvNames(
      adapters.create(entry.provider, { apiKey: AUTH_DISCOVERY_PLACEHOLDER }),
    );
  } catch (error) {
    return {
      failure: {
        outcome: PROBE_OUTCOME.unprobeable,
        detail: `adapter ${entry.provider} could not be constructed: ${String(error?.message ?? error)}`,
      },
    };
  }
  const credential = firstPresent(env, envNames);
  if (!credential) {
    return {
      failure: {
        outcome: PROBE_OUTCOME.noCredential,
        detail: `no value for ${envNames.join(' or ') || 'any declared credential'}`,
      },
    };
  }

  return { adapter: adapters.create(entry.provider, { apiKey: credential.value }) };
}

async function probeOne(entry, options) {
  const { env, adapters, now, timeoutMs } = options;
  const resolved = resolveProbeAdapter(entry, env, adapters);
  if (resolved.failure) return resolved.failure;

  const adapter = resolved.adapter;
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

/**
 * A route that answers text is asked once more, with one tool it was told to
 * call. Honoured means the stream opened a tool call; not honoured means the
 * route answered without one, which is the quiet failure the compiled
 * capability flag cannot see.
 */
async function probeToolSupportOne(entry, options) {
  const { env, adapters, timeoutMs } = options;
  const resolved = resolveProbeAdapter(entry, env, adapters);
  if (resolved.failure) {
    return { toolOutcome: TOOL_PROBE_OUTCOME.skipped, toolDetail: resolved.failure.detail };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for await (const chunk of resolved.adapter.stream(
      {
        model: entry.providerModelId,
        messages: [{ role: 'user', content: PROBE_TOOL_PROMPT }],
        maxOutputTokens: PROBE_TOOL_MAX_OUTPUT_TOKENS,
        tools: [PROBE_TOOL],
        toolChoice: PROBE_TOOL_CHOICE,
      },
      controller.signal,
    )) {
      if (chunk.type === TOOL_USE_START_CHUNK) return { toolOutcome: TOOL_PROBE_OUTCOME.honoured };
      if (chunk.type === ERROR_CHUNK) {
        return { toolOutcome: TOOL_PROBE_OUTCOME.failed, toolDetail: chunk.message };
      }
    }
  } catch (error) {
    return { toolOutcome: TOOL_PROBE_OUTCOME.failed, toolDetail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }

  return { toolOutcome: TOOL_PROBE_OUTCOME.notHonoured };
}

export async function runProbes(registry, options) {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => Date.now());
  const adapters = options.adapters ?? (await loadProviderAdapters());
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const probedOn = today(options.runAt ?? Date.now());
  const probeTools = options.tools === true;

  const probes = {};
  for (const entry of buildProbePlan(registry)) {
    const result = await probeOne(entry, { env, adapters, now, timeoutMs });
    const tool =
      probeTools && result.outcome === PROBE_OUTCOME.answered
        ? await probeToolSupportOne(entry, { env, adapters, timeoutMs })
        : undefined;
    probes[entry.modelKey] = {
      routeId: entry.routeId,
      probedOn,
      outcome: result.outcome,
      ttfbMs: result.ttfbMs ?? null,
      echoedModelId: result.echoedModelId ?? UNKNOWN_ECHO,
      detail: result.detail ?? null,
      ...(probeTools
        ? {
            toolOutcome: tool?.toolOutcome ?? TOOL_PROBE_OUTCOME.skipped,
            toolDetail: tool?.toolDetail ?? UNPROBED_TOOL_SUPPORT,
          }
        : {}),
    };
  }
  return { schemaVersion: PROBE_SCHEMA_VERSION, lastRunOn: probedOn, probes };
}

export function routesNotHonouringTools(probeFile) {
  return Object.entries(probeFile?.probes ?? {})
    .filter(([, probe]) => probe.toolOutcome === TOOL_PROBE_OUTCOME.notHonoured)
    .map(([, probe]) => probe.routeId);
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

  const probeTools = args.includes(TOOLS_FLAG);
  const probeFile = await runProbes(registry, { tools: probeTools });
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

  if (probeTools) {
    const toolCounts = {};
    for (const probe of Object.values(probeFile.probes)) {
      if (!probe.toolOutcome) continue;
      toolCounts[probe.toolOutcome] = (toolCounts[probe.toolOutcome] ?? 0) + 1;
    }
    console.log(
      `[probe] tool support → ${Object.entries(toolCounts)
        .map(([outcome, count]) => `${outcome} ${count}`)
        .join(', ')}`,
    );
    const notHonouring = routesNotHonouringTools(probeFile);
    if (notHonouring.length > 0) {
      console.log(`[probe] route(s) not honouring tools: ${notHonouring.join(', ')}`);
    }
  }

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
