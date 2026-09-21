import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parse, stringify } from 'yaml';

import {
  CI_WORKFLOW,
  EVALS_WORKFLOW,
  REGISTRY_PATH,
  REPO_ROOT,
  ROUTING_SOURCES,
  RUNTIME_ADAPTER_SUITES,
  checkModelChangeSuites,
  globToRegExp,
  routedAdapters,
  triggerRuns,
} from './check-model-change-suites.mjs';

const roots = [];
const realRegistry = JSON.parse(readFileSync(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8'));
const realCi = parse(readFileSync(path.join(REPO_ROOT, CI_WORKFLOW), 'utf8'));
const realEvals = parse(readFileSync(path.join(REPO_ROOT, EVALS_WORKFLOW), 'utf8'));
const realManifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** The real registry and workflows, with each routed adapter reduced to a manifest and one test. */
function fixture({ registry, ci, evals, manifest, adapterPackage } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'model-change-suites-'));
  roots.push(root);
  const reg = clone(realRegistry);
  const ciDoc = clone(realCi);
  const evalsDoc = clone(realEvals);
  const pkg = clone(realManifest);
  registry?.(reg);
  ci?.(ciDoc);
  evals?.(evalsDoc);
  manifest?.(pkg);
  write(root, REGISTRY_PATH, JSON.stringify(reg));
  write(root, CI_WORKFLOW, stringify(ciDoc));
  write(root, EVALS_WORKFLOW, stringify(evalsDoc));
  write(root, 'package.json', JSON.stringify(pkg));
  for (const source of ROUTING_SOURCES) {
    if (source !== REGISTRY_PATH) write(root, source, '{}');
  }

  for (const adapter of routedAdapters(reg).keys()) {
    if (adapter.startsWith('@')) {
      const dir = `packages/ai/providers/${adapter.replace('@agiworkforce/providers-', '')}`;
      const manifestFor = { name: adapter, scripts: { test: 'vitest run' } };
      const shape = adapterPackage?.(adapter, manifestFor) ?? { withTest: true };
      write(root, `${dir}/package.json`, JSON.stringify(manifestFor));
      if (shape.withTest) write(root, `${dir}/src/__tests__/adapter.test.ts`, '');
    } else if (adapter.includes('/')) {
      write(root, `${adapter}/route.test.ts`, '');
    } else if (RUNTIME_ADAPTER_SUITES[adapter]) {
      write(root, `${RUNTIME_ADAPTER_SUITES[adapter]}/route.test.ts`, '');
    }
  }
  return root;
}

function errorsFor(options) {
  return checkModelChangeSuites(fixture(options)).errors;
}

function jobRunning(document, pattern) {
  return Object.values(document.jobs).find((job) =>
    (job.steps ?? []).some((step) => typeof step.run === 'string' && pattern.test(step.run)),
  );
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository as it stands passes', () => {
  const result = checkModelChangeSuites(REPO_ROOT);
  assert.deepEqual(result.errors, []);
  assert.ok(result.adaptersChecked > 0);
});

test('the fixture reproduces the repository before any mutation', () => {
  assert.deepEqual(errorsFor(), []);
});

test('an adapter package with no test file fails, naming it', () => {
  const errors = errorsFor({
    adapterPackage: (adapter) => ({ withTest: adapter !== '@agiworkforce/providers-anthropic' }),
  });
  assert.ok(
    errors.some((error) => /providers-anthropic.*has no test file/.test(error)),
    errors,
  );
});

test('an adapter package with no test script fails', () => {
  const errors = errorsFor({
    adapterPackage: (adapter, manifest) => {
      if (adapter === '@agiworkforce/providers-qwen') delete manifest.scripts.test;
      return { withTest: true };
    },
  });
  assert.ok(
    errors.some((error) => /providers-qwen has no test script/.test(error)),
    errors,
  );
});

test('a route served by an adapter nothing resolves fails', () => {
  const errors = errorsFor({
    registry: (reg) => {
      const [routeId] = Object.keys(reg.routes);
      reg.harnesses['fixture/unresolved'] = {
        ...reg.harnesses[reg.routes[routeId].harnessId],
        adapter: 'unmapped-runtime',
      };
      reg.routes[routeId].harnessId = 'fixture/unresolved';
    },
  });
  assert.ok(
    errors.some((error) => /unmapped-runtime .*resolves to no/.test(error)),
    errors,
  );
});

test('a CI filter that skips provider adapters fails', () => {
  const errors = errorsFor({
    ci: (doc) => {
      doc.on.pull_request['paths-ignore'].push('packages/ai/providers/**');
    },
  });
  assert.ok(
    errors.some((error) => /pull_request that changes packages\/ai\/providers\//.test(error)),
    errors,
  );
});

test('an evals workflow that stops watching the adapters fails', () => {
  const errors = errorsFor({
    evals: (doc) => {
      doc.on.pull_request.paths = doc.on.pull_request.paths.filter(
        (glob) => glob !== 'packages/ai/providers/**',
      );
    },
  });
  assert.ok(
    errors.some((error) => error.startsWith(`${EVALS_WORKFLOW}: a pull_request`)),
    errors,
  );
});

test('a CI filter that skips the routing policy fails', () => {
  const errors = errorsFor({
    ci: (doc) => {
      doc.on.push['paths-ignore'].push('packages/ai/model-registry/**');
    },
  });
  assert.ok(
    errors.some((error) => /routing-policies\.json does not start it/.test(error)),
    errors,
  );
});

test('a routing replay behind a job condition no longer counts', () => {
  const errors = errorsFor({
    ci: (doc) => {
      jobRunning(doc, /auto-route-conformance/).if = "github.event_name == 'push'";
    },
  });
  assert.ok(
    errors.some((error) => /TypeScript Auto resolver replay/.test(error)),
    errors,
  );
  assert.ok(
    errors.some((error) => /Rust Auto resolver replay/.test(error)),
    errors,
  );
});

test('a routing replay that may fail softly no longer counts', () => {
  const errors = errorsFor({
    ci: (doc) => {
      const job = jobRunning(doc, /auto_route_conformance/);
      const step = job.steps.find((entry) => /auto_route_conformance/.test(entry.run ?? ''));
      step['continue-on-error'] = true;
    },
  });
  assert.ok(
    errors.some((error) => /Rust Auto resolver replay/.test(error)),
    errors,
  );
});

test('dropping the affected test run fails', () => {
  const errors = errorsFor({
    ci: (doc) => {
      const job = jobRunning(doc, /pnpm test:affected/);
      job.steps = job.steps.filter((step) => !/pnpm test:affected/.test(step.run ?? ''));
    },
  });
  assert.ok(errors.some((error) => /no unconditional step runs `pnpm test:affected`/.test(error)));
});

test('a test:affected that stops running package suites fails', () => {
  const errors = errorsFor({
    manifest: (pkg) => {
      pkg.scripts['test:affected'] = 'echo skipped';
    },
  });
  assert.ok(
    errors.some((error) => /test:affected is "echo skipped"/.test(error)),
    errors,
  );
});

test('a registry that routes nothing is reported, not passed', () => {
  const errors = errorsFor({
    registry: (reg) => {
      reg.routes = {};
    },
  });
  assert.ok(
    errors.some((error) => /pass vacuously/.test(error)),
    errors,
  );
});

test('workflow path globs match the way the workflow reads them', () => {
  assert.ok(
    globToRegExp('packages/ai/providers/**').test('packages/ai/providers/xai/src/index.ts'),
  );
  assert.ok(globToRegExp('*.md').test('README.md'));
  assert.ok(!globToRegExp('*.md').test('docs/README.md'));
  assert.ok(globToRegExp('docs/**').test('docs/a/b.md'));
  assert.equal(triggerRuns(undefined, 'a.ts'), false);
  assert.equal(triggerRuns(null, 'a.ts'), true);
  assert.equal(triggerRuns({ paths: ['tools/**'] }, 'packages/x.ts'), false);
  assert.equal(triggerRuns({ 'paths-ignore': ['docs/**'] }, 'packages/x.ts'), true);
});
