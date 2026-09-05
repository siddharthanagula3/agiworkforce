import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  PROBE_MAX_OUTPUT_TOKENS,
  PROBE_OUTCOME,
  PROBE_PROMPT,
  PROBE_TOOL,
  PROBE_TOOL_CHOICE,
  PROBE_TOOL_MAX_OUTPUT_TOKENS,
  PROBE_TOOL_NAME,
  PROBE_TOOL_PROMPT,
  PROBES_JSON,
  REPO_ROOT,
  TOOL_PROBE_OUTCOME,
  advancedStages,
  answeringModelKeys,
  buildProbePlan,
  routesNotHonouringTools,
  runProbes,
  silentPromotedModels,
} from './probe-models.mjs';
import { LIFECYCLE_STAGE } from '../packages/ai/model-registry/scripts/lifecycle-stages.mjs';

const REGISTRY = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'packages/ai/model-registry/generated/registry.json'), 'utf8'),
);
const CURATION = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'packages/ai/model-registry/catalog/models.curation.json'),
    'utf8',
  ),
);
const COMMITTED_PROBES = JSON.parse(readFileSync(PROBES_JSON, 'utf8'));

const PROVIDER = 'fake_provider';
const CREDENTIAL_ENV = 'FAKE_PROVIDER_API_KEY';
const ECHOED_MODEL_ID = 'fake-model-echo';
const TTFB_MS = 120;

function fakeRegistry(overrides = {}) {
  return {
    models: {
      alpha: {
        lifecycle: {
          availability: 'live',
          deprecated: false,
          stage: LIFECYCLE_STAGE.registered,
        },
      },
      beta: {
        lifecycle: {
          availability: 'live',
          deprecated: false,
          stage: LIFECYCLE_STAGE.promoted,
        },
      },
      ...overrides.models,
    },
    capabilities: {
      alpha: { textOutput: true },
      beta: { textOutput: true },
      ...overrides.capabilities,
    },
    routes: {
      'fake/alpha': {
        modelKey: 'alpha',
        provider: PROVIDER,
        providerModelId: 'alpha-wire',
        harnessId: 'fake/chat',
        isDefault: true,
      },
      'fake/alpha-secondary': {
        modelKey: 'alpha',
        provider: PROVIDER,
        providerModelId: 'alpha-wire',
        harnessId: 'fake/chat',
        isDefault: false,
      },
      'fake/beta': {
        modelKey: 'beta',
        provider: PROVIDER,
        providerModelId: 'beta-wire',
        harnessId: 'fake/chat',
        isDefault: true,
      },
      ...overrides.routes,
    },
  };
}

function fakeAdapters(behaviour) {
  const requests = [];
  return {
    requests,
    adapters: {
      isKnownProvider: (providerId) => providerId === PROVIDER,
      create: () => ({
        auth: [{ kind: 'api-key', envVar: CREDENTIAL_ENV, required: true }],
        async *stream(request) {
          requests.push(request);
          yield* behaviour(request);
        },
      }),
    },
  };
}

function* answers() {
  yield { type: 'response-meta', model: ECHOED_MODEL_ID };
  yield { type: 'text-delta', delta: 'pong' };
  yield { type: 'stop', reason: 'max_tokens' };
}

function* refuses() {
  yield { type: 'error', message: 'model_not_found' };
}

function clock() {
  let value = 0;
  return () => {
    const current = value;
    value += TTFB_MS;
    return current;
  };
}

test('the plan holds one entry per model, on the model default route', () => {
  const plan = buildProbePlan(fakeRegistry());
  assert.deepEqual(
    plan.map((entry) => [entry.modelKey, entry.routeId]),
    [
      ['alpha', 'fake/alpha'],
      ['beta', 'fake/beta'],
    ],
  );
});

test('the plan skips a model that cannot answer with text, is not live, or is deprecated', () => {
  const registry = fakeRegistry();
  registry.capabilities.alpha = { textOutput: false };
  registry.models.beta.lifecycle.availability = 'preview';
  assert.deepEqual(buildProbePlan(registry), []);

  const deprecated = fakeRegistry();
  deprecated.models.alpha.lifecycle.deprecated = true;
  deprecated.models.beta.lifecycle.deprecated = true;
  assert.deepEqual(buildProbePlan(deprecated), []);
});

test('one minimal request per model, and no request without a credential', async () => {
  const { adapters, requests } = fakeAdapters(answers);
  const withKey = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
    now: clock(),
    runAt: Date.parse('2026-09-05T00:00:00Z'),
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.maxOutputTokens, PROBE_MAX_OUTPUT_TOKENS);
    assert.deepEqual(request.messages, [{ role: 'user', content: PROBE_PROMPT }]);
    assert.equal(request.tools, undefined);
  }
  assert.equal(withKey.probes.alpha.outcome, PROBE_OUTCOME.answered);
  assert.equal(withKey.probes.alpha.echoedModelId, ECHOED_MODEL_ID);
  assert.equal(withKey.probes.alpha.ttfbMs, TTFB_MS);
  assert.equal(withKey.lastRunOn, '2026-09-05');

  const bare = fakeAdapters(answers);
  const withoutKey = await runProbes(fakeRegistry(), { adapters: bare.adapters, env: {} });
  assert.equal(bare.requests.length, 0);
  assert.equal(withoutKey.probes.alpha.outcome, PROBE_OUTCOME.noCredential);
  assert.match(withoutKey.probes.alpha.detail, new RegExp(CREDENTIAL_ENV));
});

test('a provider with no constructible adapter is recorded, not silently dropped', async () => {
  const registry = fakeRegistry();
  registry.routes['fake/alpha'].provider = 'no_such_provider';
  const { adapters } = fakeAdapters(answers);
  const probed = await runProbes(registry, { adapters, env: { [CREDENTIAL_ENV]: 'a-key' } });
  assert.equal(probed.probes.alpha.outcome, PROBE_OUTCOME.unprobeable);
  assert.equal(probed.probes.beta.outcome, PROBE_OUTCOME.answered);
});

test('an error chunk is a failure, and it carries the provider message', async () => {
  const { adapters } = fakeAdapters(refuses);
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
  });
  assert.equal(probed.probes.alpha.outcome, PROBE_OUTCOME.failed);
  assert.equal(probed.probes.alpha.detail, 'model_not_found');
  assert.deepEqual([...answeringModelKeys(probed)], []);
});

test('a promoted model that fails is reported; one with no credential is not', async () => {
  const registry = fakeRegistry();
  const { adapters } = fakeAdapters(refuses);
  const failed = await runProbes(registry, { adapters, env: { [CREDENTIAL_ENV]: 'a-key' } });
  assert.deepEqual(silentPromotedModels(registry, failed), ['beta']);

  const skipped = await runProbes(registry, { adapters: fakeAdapters(refuses).adapters, env: {} });
  assert.deepEqual(silentPromotedModels(registry, skipped), []);
});

test('an answered probe advances a registered model, and nothing else', async () => {
  const { adapters } = fakeAdapters(answers);
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
  });
  const curation = {
    models: {
      alpha: { lifecycle: { stage: LIFECYCLE_STAGE.registered } },
      beta: { lifecycle: { stage: LIFECYCLE_STAGE.promoted } },
    },
  };
  const advanced = advancedStages(curation, probed);
  assert.deepEqual(
    advanced.map((move) => [move.modelKey, move.from, move.to]),
    [['alpha', LIFECYCLE_STAGE.registered, LIFECYCLE_STAGE.probed]],
  );
  assert.match(advanced[0].source, /probes\.json#alpha$/);
});

function* callsTheTool() {
  yield { type: 'tool-use-start', toolUseId: 'probe-1', name: PROBE_TOOL_NAME };
  yield { type: 'stop', reason: 'tool_use' };
}

function toolProbeBehaviour(onTools) {
  return function* behaviour(request) {
    if (!request.tools) {
      yield* answers();
      return;
    }
    yield* onTools();
  };
}

test('the tool probe is off by default and carries no tool', async () => {
  const { adapters, requests } = fakeAdapters(answers);
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
  });
  assert.equal(requests.length, 2);
  for (const request of requests) assert.equal(request.tools, undefined);
  assert.equal(probed.probes.alpha.toolOutcome, undefined);
});

test('the tool probe sends one trivial tool and records that it was honoured', async () => {
  const { adapters, requests } = fakeAdapters(toolProbeBehaviour(callsTheTool));
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
    tools: true,
  });

  const toolRequests = requests.filter((request) => request.tools);
  assert.equal(toolRequests.length, 2);
  for (const request of toolRequests) {
    assert.deepEqual(request.tools, [PROBE_TOOL]);
    assert.equal(request.toolChoice, PROBE_TOOL_CHOICE);
    assert.equal(request.maxOutputTokens, PROBE_TOOL_MAX_OUTPUT_TOKENS);
    assert.deepEqual(request.messages, [{ role: 'user', content: PROBE_TOOL_PROMPT }]);
  }
  assert.equal(probed.probes.alpha.toolOutcome, TOOL_PROBE_OUTCOME.honoured);
  assert.equal(probed.probes.alpha.outcome, PROBE_OUTCOME.answered);
  assert.deepEqual(routesNotHonouringTools(probed), []);
});

test('a route that answers without calling the tool is reported per route', async () => {
  const { adapters } = fakeAdapters(toolProbeBehaviour(answers));
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
    tools: true,
  });
  assert.equal(probed.probes.alpha.toolOutcome, TOOL_PROBE_OUTCOME.notHonoured);
  assert.deepEqual(routesNotHonouringTools(probed).sort(), ['fake/alpha', 'fake/beta']);
});

test('a tool probe error never changes the liveness verdict', async () => {
  const { adapters } = fakeAdapters(toolProbeBehaviour(refuses));
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
    tools: true,
  });
  assert.equal(probed.probes.beta.outcome, PROBE_OUTCOME.answered);
  assert.equal(probed.probes.beta.toolOutcome, TOOL_PROBE_OUTCOME.failed);
  assert.deepEqual(silentPromotedModels(fakeRegistry(), probed), []);
  assert.deepEqual([...answeringModelKeys(probed)].sort(), ['alpha', 'beta']);
});

test('a model that never answered is not asked about tools', async () => {
  const { adapters, requests } = fakeAdapters(refuses);
  const probed = await runProbes(fakeRegistry(), {
    adapters,
    env: { [CREDENTIAL_ENV]: 'a-key' },
    tools: true,
  });
  assert.equal(requests.filter((request) => request.tools).length, 0);
  assert.equal(probed.probes.alpha.toolOutcome, TOOL_PROBE_OUTCOME.skipped);
});

test('the committed probe file covers exactly the models the plan names', () => {
  const plan = buildProbePlan(REGISTRY);
  assert.deepEqual(
    Object.keys(COMMITTED_PROBES.probes).sort(),
    plan.map((entry) => entry.modelKey).sort(),
  );
  for (const [modelKey, probe] of Object.entries(COMMITTED_PROBES.probes)) {
    assert.ok(
      Object.values(PROBE_OUTCOME).includes(probe.outcome),
      `${modelKey} outcome ${probe.outcome} is not a known outcome`,
    );
    assert.ok(CURATION.models[modelKey], `${modelKey} is not in the curation catalog`);
  }
});
