import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { collectViolations } from './check-model-registry-integrity.mjs';

const root = process.cwd();
const schema = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/ai/model-registry/schema/registry.schema.json'),
    'utf8',
  ),
);

const DECIDED_FLAGS = [
  'textInput',
  'imageInput',
  'audioInput',
  'videoInput',
  'textOutput',
  'imageOutput',
  'audioOutput',
  'videoOutput',
  'streaming',
  'structuredOutput',
  'functionCalling',
  'reasoning',
  'computerUse',
  'agentic',
  'webSearch',
  'deepResearch',
  'codeExecution',
  'promptCaching',
];

function capabilityRecord() {
  const record = { imageEditing: null, realtime: null, reranking: null, toolSchemaSupport: null };
  for (const flag of DECIDED_FLAGS) record[flag] = flag === 'textOutput';
  return record;
}

function baseRegistry() {
  return {
    models: {
      'alpha-1': {
        identity: { key: 'alpha-1', displayName: 'Alpha 1', kind: 'chat', role: 'assistant' },
        lifecycle: { status: 'active', availability: 'live', deprecated: false },
        residencyRegions: ['us'],
      },
      'alpha-2': {
        identity: { key: 'alpha-2', displayName: 'Alpha 2', kind: 'chat', role: 'assistant' },
        lifecycle: { status: 'active', availability: 'live', deprecated: false },
        residencyRegions: ['us'],
      },
    },
    capabilities: { 'alpha-1': capabilityRecord(), 'alpha-2': capabilityRecord() },
    limits: { 'alpha-1': { contextTokens: 200000 }, 'alpha-2': { contextTokens: 200000 } },
    pricing: {
      'alpha-1': { currency: 'USD', unit: 'per_million_tokens' },
      'alpha-2': { currency: 'USD', unit: 'per_million_tokens' },
    },
    governance: { acme: { residencyRegions: ['us'] } },
    harnesses: { 'acme/chat': { provider: 'acme', trustModes: ['managed_cloud', 'byok'] } },
    retiredModels: {},
    routes: {
      'acme/alpha-1': route('alpha-1'),
      'acme/alpha-2': route('alpha-2'),
    },
  };
}

function route(modelKey) {
  return {
    modelKey,
    provider: 'acme',
    providerModelId: modelKey,
    harnessId: 'acme/chat',
    trustModes: ['managed_cloud'],
    availability: 'live',
    selectable: true,
    isDefault: true,
    cacheClass: 'no_provider_cache',
    commercialStatus: 'agi_direct',
    dataRetention: 'provider_default',
    pricing: {
      currency: 'USD',
      unit: 'per_million_tokens',
      inputPerMillion: 3,
      outputPerMillion: 9,
    },
  };
}

function checksFor(mutate) {
  const registry = baseRegistry();
  mutate(registry);
  return new Set(collectViolations(registry, schema).map((violation) => violation.check));
}

test('a registry with nothing wrong with it raises nothing', () => {
  assert.deepEqual(collectViolations(baseRegistry(), schema), []);
});

test('a route pointing at a model that is not there is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].modelKey = 'alpha-9';
    }).has('route model'),
  );
});

test('a route pointing at a harness that is not there is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].harnessId = 'acme/missing';
    }).has('route harness'),
  );
});

test('a route dispatching through another provider than its harness is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.harnesses['acme/chat'].provider = 'other';
    }).has('route harness'),
  );
});

test('a trust mode the harness cannot carry is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.harnesses['acme/chat'].trustModes = ['byok'];
    }).has('route trust modes'),
  );
});

test('a trust mode outside the schema vocabulary is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].trustModes = ['whatever'];
    }).has('route trust modes'),
  );
});

test('a route with no trust mode at all is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].trustModes = [];
    }).has('route trust modes'),
  );
});

for (const field of ['cacheClass', 'commercialStatus', 'dataRetention']) {
  test(`a route whose ${field} is outside the vocabulary is caught`, () => {
    assert.ok(
      checksFor((registry) => {
        registry.routes['acme/alpha-1'][field] = 'invented';
      }).has('route vocabulary'),
    );
  });
}

test('a live selectable route on a model that is no longer live is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].lifecycle.availability = 'unavailable';
    }).has('route lifecycle'),
  );
});

test('a live selectable route on a deprecated model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].lifecycle.deprecated = true;
      registry.models['alpha-1'].lifecycle.deprecatedOn = '2026-09-01';
      registry.models['alpha-1'].lifecycle.replacedBy = 'alpha-2';
    }).has('route lifecycle'),
  );
});

test('a deprecation with no replacement is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].lifecycle.deprecated = true;
      registry.models['alpha-1'].lifecycle.deprecatedOn = '2026-09-01';
      registry.routes['acme/alpha-1'].selectable = false;
    }).has('deprecation'),
  );
});

test('a deprecation that points at another deprecated model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].lifecycle.deprecated = true;
      registry.models['alpha-1'].lifecycle.deprecatedOn = '2026-09-01';
      registry.models['alpha-1'].lifecycle.replacedBy = 'alpha-2';
      registry.routes['acme/alpha-1'].selectable = false;
      registry.models['alpha-2'].lifecycle.deprecated = true;
    }).has('deprecation'),
  );
});

test('a deprecation without the day it was deprecated is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].lifecycle.deprecated = true;
      registry.models['alpha-1'].lifecycle.replacedBy = 'alpha-2';
      registry.routes['acme/alpha-1'].selectable = false;
    }).has('deprecation'),
  );
});

test('a live model no live route can reach is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].availability = 'unavailable';
      registry.routes['acme/alpha-1'].selectable = false;
    }).has('model reachability'),
  );
});

test('a retired id that survives as a model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.retiredModels['alpha-1'] = { id: 'alpha-1' };
    }).has('retired model'),
  );
});

test('a model whose identity key disagrees with its own record key is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].identity.key = 'alpha-elsewhere';
    }).has('model identity'),
  );
});

for (const [record, check] of [
  ['capabilities', 'model capabilities'],
  ['limits', 'model limits'],
  ['pricing', 'model pricing'],
]) {
  test(`a model with no ${record} record is caught`, () => {
    assert.ok(
      checksFor((registry) => {
        delete registry[record]['alpha-1'];
      }).has(check),
    );
  });
}

test('a token-context model with no context window is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.limits['alpha-1'].contextTokens = 0;
    }).has('model limits'),
  );
});

test('a residency region no provider publishes is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.models['alpha-1'].residencyRegions = ['atlantis'];
    }).has('model residency'),
  );
});

test('an unpublished residency list is not a violation', () => {
  assert.ok(
    !checksFor((registry) => {
      registry.models['alpha-1'].residencyRegions = null;
    }).has('model residency'),
  );
});

test('a route with no price sheet is caught', () => {
  assert.ok(
    checksFor((registry) => {
      delete registry.routes['acme/alpha-1'].pricing;
    }).has('route pricing'),
  );
});

test('a negative rate is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].pricing.outputPerMillion = -1;
    }).has('route pricing'),
  );
});

test('a route pricing in another unit than its own model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].pricing.unit = 'per_image';
    }).has('route pricing'),
  );
});

test('a route pricing in another currency than its own model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].pricing.currency = 'EUR';
    }).has('route pricing'),
  );
});

test('a managed route that bills nothing for a model that answers in tokens is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.routes['acme/alpha-1'].pricing.inputPerMillion = 0;
    }).has('managed pricing'),
  );
});

test('a router alias may price at zero', () => {
  assert.ok(
    !checksFor((registry) => {
      registry.models['alpha-1'].identity.role = 'router';
      registry.routes['acme/alpha-1'].pricing.inputPerMillion = 0;
    }).has('managed pricing'),
  );
});

test('a model that answers in no tokens may price at zero', () => {
  assert.ok(
    !checksFor((registry) => {
      registry.capabilities['alpha-1'].textOutput = false;
      registry.routes['acme/alpha-1'].pricing.inputPerMillion = 0;
    }).has('managed pricing'),
  );
});

test('a BYOK-only route is not held to the managed price floor', () => {
  assert.ok(
    !checksFor((registry) => {
      registry.routes['acme/alpha-1'].trustModes = ['byok'];
      registry.routes['acme/alpha-1'].pricing.inputPerMillion = 0;
    }).has('managed pricing'),
  );
});

test('a capability the catalog never decided for this model is caught', () => {
  assert.ok(
    checksFor((registry) => {
      registry.capabilities['alpha-1'].functionCalling = null;
    }).has('model capabilities'),
  );
});

test('a capability flag the record simply omits is caught', () => {
  assert.ok(
    checksFor((registry) => {
      delete registry.capabilities['alpha-1'].streaming;
    }).has('model capabilities'),
  );
});

test('the four flags the catalog has never decided may stay undecided', () => {
  assert.ok(
    !checksFor((registry) => {
      registry.capabilities['alpha-1'].reranking = null;
    }).has('model capabilities'),
  );
});
