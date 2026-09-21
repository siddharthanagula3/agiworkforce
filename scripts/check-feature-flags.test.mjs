import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE,
  CONFIG_SCHEMA,
  FLAG_DIR,
  GATE_MODULES,
  ME_CONTRACT,
  checkFeatureFlags,
  flagPrefixes,
} from './check-feature-flags.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const SCHEMA =
  "export const FLAG_NAMESPACE_IDS = ['capability', 'routing'] as const;\n" +
  "const SHAPES = [{ reader: 'lib/feature-flags/kill-switches' }, { reader: 'lib/feature-flags/routing-flags' }];\n";

const ME =
  'export const MeFeatureFlagsSchema = z\n  .object({\n    advanced_model_access: z.boolean(),\n  })\n  .catchall(z.unknown());\n';

function fixture({ schema, me, baseline, extra = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'feature-flags-'));
  roots.push(root);
  write(
    root,
    `${FLAG_DIR}/kill-switches.ts`,
    "export const CAPABILITY_FLAG_PREFIX = 'capability.';\n",
  );
  write(root, `${FLAG_DIR}/routing-flags.ts`, "export const ROUTING_FLAG_PREFIX = 'routing.';\n");
  write(root, CONFIG_SCHEMA, schema ?? SCHEMA);
  write(root, ME_CONTRACT, me ?? ME);
  for (const module of GATE_MODULES) write(root, module, 'export const gate = true;\n');
  write(root, 'apps/web/lib/billing/plans.ts', 'export const plans = [];\n');
  for (const [file, contents] of Object.entries(extra)) write(root, file, contents);
  write(
    root,
    BASELINE,
    JSON.stringify(
      baseline ?? {
        handSpelled: [],
        resolvedElsewhere: {
          advanced_model_access: {
            resolvedBy: 'apps/web/lib/billing/plans.ts (plans)',
            reason: 'A plan entitlement handed to clients inside the flag object.',
          },
        },
      },
    ),
  );
  return root;
}

function errorsOf(options) {
  return checkFeatureFlags(fixture(options)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a tree where every key is derived and every gate is flag-free passes', () => {
  const result = checkFeatureFlags(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.prefixes, 2);
});

test('prefixes are read from the modules that define them', () => {
  assert.deepEqual(
    flagPrefixes(fixture()).map((entry) => entry.prefix),
    ['capability.', 'routing.'],
  );
});

test('a hand-spelled flag key outside the flag module fails', () => {
  const errors = errorsOf({
    extra: { 'apps/web/lib/chat/send.ts': "const key = 'capability.can_chat';\n" },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /spells the flag key "capability.can_chat" by hand/);
});

test('a hand-spelled key is reported once however often it appears', () => {
  const errors = errorsOf({
    extra: {
      'apps/web/lib/chat/send.ts': "const a = 'routing.canary';\nconst b = 'routing.canary';\n",
    },
  });
  assert.equal(errors.length, 1);
});

test('a hand-spelled key with a recorded reason passes', () => {
  const errors = errorsOf({
    extra: { 'apps/web/lib/chat/send.ts': "const key = 'routing.canary';\n" },
    baseline: {
      handSpelled: [
        {
          file: 'apps/web/lib/chat/send.ts',
          key: 'routing.canary',
          reason: 'An event name that collides with the prefix.',
        },
      ],
      resolvedElsewhere: {
        advanced_model_access: {
          resolvedBy: 'apps/web/lib/billing/plans.ts',
          reason: 'A plan entitlement.',
        },
      },
    },
  });
  assert.deepEqual(errors, []);
});

test('an allowance matching nothing any more fails, so the list shrinks', () => {
  const errors = errorsOf({
    baseline: {
      handSpelled: [
        { file: 'apps/web/lib/gone.ts', key: 'routing.canary', reason: 'was needed once' },
      ],
      resolvedElsewhere: {
        advanced_model_access: {
          resolvedBy: 'apps/web/lib/billing/plans.ts',
          reason: 'A plan entitlement.',
        },
      },
    },
  });
  assert.match(errors.join('\n'), /matches nothing any more/);
});

test('a gate module importing the flag evaluator fails', () => {
  const errors = errorsOf({
    extra: {
      [GATE_MODULES[0]]: "import { evaluateFlags } from '@/lib/feature-flags/evaluate-flags';\n",
    },
  });
  assert.match(errors.join('\n'), /a gate a flag can open is not a gate/);
});

test('a gate module spelling a flag key fails', () => {
  const errors = errorsOf({
    extra: { [GATE_MODULES[1]]: "const skip = 'capability.can_chat';\n" },
  });
  assert.match(errors.join('\n'), /a flag decides an entitlement here/);
});

test('a gate module that no longer exists fails rather than passing silently', () => {
  const root = fixture();
  rmSync(path.join(root, GATE_MODULES[2]));
  assert.match(checkFeatureFlags(root).errors.join('\n'), /no longer exists/);
});

test('a wire flag with no recorded resolver fails', () => {
  const errors = errorsOf({
    me:
      'export const MeFeatureFlagsSchema = z\n  .object({\n    advanced_model_access: z.boolean(),\n' +
      '    code_execution: z.boolean(),\n  })\n  .catchall(z.unknown());\n',
  });
  assert.match(errors.join('\n'), /does not say where it is really resolved/);
});

test('a recorded resolver that no longer exists fails', () => {
  const errors = errorsOf({
    baseline: {
      handSpelled: [],
      resolvedElsewhere: {
        advanced_model_access: { resolvedBy: 'apps/web/lib/gone.ts', reason: 'moved' },
      },
    },
  });
  assert.match(errors.join('\n'), /the record of where this value really comes from has rotted/);
});

test('a namespace whose reader module is gone fails', () => {
  const errors = errorsOf({
    schema:
      "export const FLAG_NAMESPACE_IDS = ['capability'] as const;\n" +
      "const SHAPES = [{ reader: 'lib/feature-flags/nowhere' }];\n",
  });
  assert.match(errors.join('\n'), /the keys it claims to spell are spelled nowhere/);
});

test('a namespace with no reader fails', () => {
  const errors = errorsOf({
    schema:
      "export const FLAG_NAMESPACE_IDS = ['capability', 'routing'] as const;\n" +
      "const SHAPES = [{ reader: 'lib/feature-flags/kill-switches' }];\n",
  });
  assert.match(errors.join('\n'), /the keys it claims to spell are read by nobody|read by nobody/);
});
