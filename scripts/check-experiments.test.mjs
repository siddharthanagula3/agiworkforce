import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DOMAIN_REGISTRY,
  READER_MODULE,
  REGISTRY_MODULE,
  REGISTRY_PATH,
  WORKSPACE_CONTROLS,
  checkExperiments,
} from './check-experiments.mjs';

const roots = [];
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function experiment(overrides = {}) {
  return {
    hypothesis: 'A shorter composer hint raises the share of first messages that are sent.',
    owner: 'apps/web/lib/owner.ts',
    domain: 'chat',
    policy: null,
    population: 'Signed-in accounts on the web surface in their first session.',
    exclusions: ['enterprise workspaces'],
    variants: ['control', 'short_hint'],
    assignmentKey: 'user',
    exposureEvent: 'composer.hint_seen',
    primaryMetric: 'first message sent within the session',
    guardrails: ['message send errors'],
    startAt: new Date(Date.now() - YEAR_MS).toISOString(),
    endAt: new Date(Date.now() + YEAR_MS).toISOString(),
    result: 'pending',
    decision: 'pending',
    ...overrides,
  };
}

function fixture(experiments = { composer_hint: experiment() }) {
  const root = mkdtempSync(path.join(tmpdir(), 'experiments-'));
  roots.push(root);
  write(
    root,
    REGISTRY_MODULE,
    "export const EXPERIMENT_ASSIGNMENT_KEYS = ['user', 'workspace'] as const;\n" +
      "export const EXPERIMENT_RESULTS = ['pending', 'win', 'loss'] as const;\n" +
      "export const EXPERIMENT_DECISIONS = ['pending', 'ship', 'revert'] as const;\n" +
      "export const EXPERIMENT_CONTROL_VARIANT = 'control';\n" +
      "export const EXPERIMENT_FORBIDDEN_DOMAINS = ['billing', 'safety'] as const;\n",
  );
  write(
    root,
    DOMAIN_REGISTRY,
    JSON.stringify({ domains: [{ name: 'chat' }, { name: 'billing' }, { name: 'safety' }] }),
  );
  write(root, WORKSPACE_CONTROLS, "export const WORKSPACE_FEATURES = ['work', 'code'] as const;\n");
  write(root, READER_MODULE, "export const EXPERIMENT_FLAG_PREFIX = 'experiment.';\n");
  write(root, 'apps/web/lib/owner.ts', 'export const owner = true;\n');
  write(root, REGISTRY_PATH, JSON.stringify({ experiments }));
  return root;
}

function errorsOf(experiments) {
  return checkExperiments(fixture(experiments)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a fully declared running experiment passes', () => {
  const result = checkExperiments(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.experiments, 1);
});

test('an empty registry passes', () => {
  assert.deepEqual(errorsOf({}), []);
});

test('an experiment on price is refused', () => {
  const errors = errorsOf({ price_test: experiment({ domain: 'billing' }) });
  assert.match(errors.join('\n'), /not decided by which half of the population/);
});

test('an experiment on safety behaviour is refused', () => {
  const errors = errorsOf({ refusal_test: experiment({ domain: 'safety' }) });
  assert.match(errors.join('\n'), /varies the safety domain/);
});

test('an experiment that varies consent copy is refused', () => {
  const errors = errorsOf({
    wording: experiment({ exposureEvent: 'signup.consent_shown' }),
  });
  assert.match(errors.join('\n'), /varies what a person agreed to/);
});

test('two experiments sharing an exposure event fail', () => {
  const errors = errorsOf({
    one: experiment(),
    two: experiment({ variants: ['control', 'long_hint'] }),
  });
  assert.match(errors.join('\n'), /shares the exposure event/);
});

test('an experiment with no exposure event fails', () => {
  const errors = errorsOf({ composer_hint: experiment({ exposureEvent: '' }) });
  assert.match(errors.join('\n'), /separates being assigned from meeting the variation/);
});

test('an experiment with no control arm fails', () => {
  const errors = errorsOf({
    composer_hint: experiment({ variants: ['short_hint', 'long_hint'] }),
  });
  assert.match(errors.join('\n'), /nothing says what it is against/);
});

test('an experiment bucketed by something the evaluator cannot bucket fails', () => {
  const errors = errorsOf({ composer_hint: experiment({ assignmentKey: 'request' }) });
  assert.match(errors.join('\n'), /assignment would not be stable/);
});

test('an experiment naming a workspace control that does not exist fails', () => {
  const errors = errorsOf({ composer_hint: experiment({ policy: 'telepathy' }) });
  assert.match(errors.join('\n'), /administrator who turned that feature off/);
});

test('an experiment with no guardrail fails', () => {
  const errors = errorsOf({ composer_hint: experiment({ guardrails: [] }) });
  assert.match(errors.join('\n'), /nothing would stop it once it is doing harm/);
});

test('an experiment that ended with no decision fails', () => {
  const errors = errorsOf({
    composer_hint: experiment({
      startAt: new Date(Date.now() - 2 * YEAR_MS).toISOString(),
      endAt: new Date(Date.now() - YEAR_MS).toISOString(),
    }),
  });
  assert.match(errors.join('\n'), /permanent split nobody remembers taking/);
});

test('a still-running experiment that already records a decision fails', () => {
  const errors = errorsOf({ composer_hint: experiment({ decision: 'ship' }) });
  assert.match(errors.join('\n'), /still running and already records the decision/);
});

test('an experiment declaring an off arm fails', () => {
  const errors = errorsOf({
    composer_hint: experiment({ variants: ['control', 'short_hint', 'off'] }),
  });
  assert.match(errors.join('\n'), /not a result column/);
});

test('a forbidden domain no domain registry names fails', () => {
  const root = fixture();
  write(
    root,
    REGISTRY_MODULE,
    "export const EXPERIMENT_ASSIGNMENT_KEYS = ['user'] as const;\n" +
      "export const EXPERIMENT_RESULTS = ['pending'] as const;\n" +
      "export const EXPERIMENT_DECISIONS = ['pending'] as const;\n" +
      "export const EXPERIMENT_CONTROL_VARIANT = 'control';\n" +
      "export const EXPERIMENT_FORBIDDEN_DOMAINS = ['pricing'] as const;\n",
  );
  assert.match(checkExperiments(root).errors.join('\n'), /that refusal would never fire/);
});
