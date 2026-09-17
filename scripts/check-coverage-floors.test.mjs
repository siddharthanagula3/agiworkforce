import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkFloors,
  collectFloors,
  parseLinesFloor,
  parseProjects,
  parseRootFloor,
  unflooredProjects,
} from './lib/coverage-floors.mjs';

const ROOT_CONFIG = `export default defineConfig({
  test: { projects: ['packages/a', 'packages/b'], coverage: { provider: 'v8' } },
});`;

const FLOORED = `export default defineConfig({
  test: { include: ['src/**'], coverage: { provider: 'v8', thresholds: { lines: 92 } } },
});`;

const UNFLOORED = `export default defineConfig({ test: { include: ['src/**'] } });`;

const recorded = {
  rootFloor: 75,
  maxUnfloored: 1,
  floors: { 'packages/a': 92, 'packages/b': null },
};

const state = (configs, rootFloor = 75) => {
  const { floors, missingConfigs } = collectFloors(parseProjects(ROOT_CONFIG), (p) =>
    p in configs ? configs[p] : null,
  );
  return { floors, missingConfigs, rootFloor };
};

test('reads the projects list, each declared floor and the repository floor', () => {
  assert.deepEqual(parseProjects(ROOT_CONFIG), ['packages/a', 'packages/b']);
  assert.equal(parseLinesFloor(FLOORED), 92);
  assert.equal(parseLinesFloor(UNFLOORED), null);
  assert.equal(
    parseRootFloor('"test:coverage": "vitest run --coverage --coverage.threshold.lines=75"'),
    75,
  );
  assert.equal(parseRootFloor('"test:coverage": "vitest run --coverage"'), null);
});

test('today’s shape passes', () => {
  assert.deepEqual(
    checkFloors(state({ 'packages/a': FLOORED, 'packages/b': UNFLOORED }), recorded),
    [],
  );
});

test('lowering a declared floor fails', () => {
  const lowered = FLOORED.replace('lines: 92', 'lines: 70');
  const errors = checkFloors(state({ 'packages/a': lowered, 'packages/b': UNFLOORED }), recorded);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /lowered its line floor from 92 to 70/);
});

test('deleting a declared floor fails', () => {
  const errors = checkFloors(state({ 'packages/a': UNFLOORED, 'packages/b': UNFLOORED }), recorded);
  assert.ok(errors.some((e) => /dropped its declared line floor of 92/.test(e)));
});

test('a new project without a floor fails and is named', () => {
  const rootWithC = ROOT_CONFIG.replace("'packages/b'", "'packages/b', 'packages/c'");
  const { floors, missingConfigs } = collectFloors(parseProjects(rootWithC), (p) =>
    p === 'packages/a' ? FLOORED : UNFLOORED,
  );
  const errors = checkFloors({ floors, missingConfigs, rootFloor: 75 }, recorded);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /2 projects declare no line floor, above the ratchet of 1/);
  assert.match(errors[0], /packages\/c/);
});

test('lowering the repository-wide floor fails', () => {
  const errors = checkFloors(
    state({ 'packages/a': FLOORED, 'packages/b': UNFLOORED }, 60),
    recorded,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /dropped from 75 to 60/);
});

test('removing the repository-wide floor entirely fails', () => {
  const errors = checkFloors(
    state({ 'packages/a': FLOORED, 'packages/b': UNFLOORED }, null),
    recorded,
  );
  assert.match(errors[0], /no longer passes --coverage\.threshold\.lines/);
});

test('a project in the list with no vitest config fails', () => {
  const errors = checkFloors(state({ 'packages/a': FLOORED }), recorded);
  assert.ok(errors.some((e) => /packages\/b .* has no vitest config/.test(e)));
});

test('unflooredProjects names exactly the projects without a floor', () => {
  const { floors } = collectFloors(parseProjects(ROOT_CONFIG), (p) =>
    p === 'packages/a' ? FLOORED : UNFLOORED,
  );
  assert.deepEqual(unflooredProjects(floors), ['packages/b']);
});
