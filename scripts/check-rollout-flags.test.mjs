import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RISKY_SURFACES,
  checkRiskySurfaces,
  findUndeclaredFlagKeys,
  referencesFlagModule,
} from './lib/rollout-flags.mjs';

const gated = () =>
  checkRiskySurfaces((file) =>
    RISKY_SURFACES.some((surface) => surface.file === file)
      ? "import { evaluateFlagsForSubject } from '@/lib/feature-flags/flag-evaluation-service';"
      : null,
  );

test('every risky surface passes while it consults the flag module', () => {
  assert.deepEqual(gated(), []);
});

test('a risky surface that drops its flag gate fails', () => {
  const errors = checkRiskySurfaces((file) =>
    file === RISKY_SURFACES[0].file
      ? 'export function rolloutInputs() { return { slot: bestSlot() }; }'
      : "import { evaluateFlags } from './evaluate-flags';",
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer consults the flag module/);
  assert.match(errors[0], new RegExp(RISKY_SURFACES[0].why));
});

test('a risky surface that disappears fails rather than silently passing', () => {
  const errors = checkRiskySurfaces((file) =>
    file === RISKY_SURFACES[0].file ? null : "import { evaluateFlags } from './evaluate-flags';",
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer exists/);
});

test('the flag module is recognised through any of its modules', () => {
  assert.ok(referencesFlagModule("import x from '@/lib/feature-flags/flag-store';"));
  assert.ok(referencesFlagModule("import { evaluateFlags } from './evaluate-flags';"));
  assert.ok(referencesFlagModule('import type { FlagEvaluation } from "./evaluate-flags";'));
  assert.ok(referencesFlagModule('const e = await evaluateFlagsForSubject(subject);'));
  assert.equal(referencesFlagModule('export const A = 1;'), false);
});

test('a comment naming the flag module does not count as consulting it', () => {
  assert.equal(referencesFlagModule("// import { evaluateFlags } from './evaluate-flags';"), false);
});

test('a hand-spelled flag key outside the registries is reported', () => {
  const found = findUndeclaredFlagKeys(
    "const on = evaluations['routing.canary']?.enabled;",
    'apps/web/lib/services/router.ts',
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].detail, 'routing.canary');
});

test('the registries themselves are allowed to spell their own keys', () => {
  assert.deepEqual(
    findUndeclaredFlagKeys(
      "export const ROUTING_FLAG_KEYS = { canary: 'routing.canary' };",
      'apps/web/lib/feature-flags/routing-flags.ts',
    ),
    [],
  );
});

test('a key derived from the registry is not a hand-spelled key', () => {
  assert.deepEqual(
    findUndeclaredFlagKeys(
      'const on = evaluations[ROUTING_FLAG_KEYS.canary]?.enabled;',
      'apps/web/lib/services/router.ts',
    ),
    [],
  );
});
