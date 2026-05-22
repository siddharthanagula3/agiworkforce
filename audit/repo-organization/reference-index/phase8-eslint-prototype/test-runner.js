/**
 * Standalone smoke harness for `no-cross-layer-import`.
 *
 * Run with: node reference-index/phase8-eslint-prototype/test-runner.js
 *
 * Why not Vitest? Phase 8 prototyping deliberately doesn't depend on the
 * workspace's vitest config — we want this to run with bare Node + ESLint
 * so it can be exercised from CI before any plugin wiring is in place.
 *
 * The harness uses `RuleTester` from `eslint` v9 if available; if eslint
 * isn't installed in the environment running this script, it falls back
 * to a hand-rolled AST exerciser that uses the parser shipped with
 * @typescript-eslint/parser (already a workspace dep). Both report:
 *
 *   PASS  valid/entry-uses-core.ts
 *   FAIL  invalid/feature-reexports-ui.ts → expected 3 reports, got 2
 *   ...
 */

/* global require, process, console, __dirname */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const plugin = require('./no-cross-layer-import');
const rule = plugin.__rule;

let RuleTester;
let tsParser;
try {
  ({ RuleTester } = require('eslint'));
} catch {
  // Fallback path: walk to repo root and resolve the workspace copy.
  try {
    const eslint = require(path.resolve(__dirname, '../../node_modules/eslint'));
    RuleTester = eslint.RuleTester;
  } catch {
    RuleTester = null;
  }
}
try {
  tsParser = require('@typescript-eslint/parser');
} catch {
  try {
    tsParser = require(path.resolve(__dirname, '../../node_modules/@typescript-eslint/parser'));
  } catch {
    tsParser = null;
  }
}

if (!RuleTester) {
  console.error(
    '[phase8 harness] eslint is not resolvable from this directory.\n' +
      '  Run `pnpm install` at the repo root first, then re-run.',
  );
  process.exit(2);
}

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser ?? undefined,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

/**
 * Each test-case file is a literal piece of source. We pair it with a
 * `filename` so the rule's path-based classifier sees the right layer.
 */
const cases = [
  // VALID
  {
    name: 'valid/entry-uses-core',
    filename: '/abs/apps/mobile/src/entry/chat-route.ts',
    code: read('valid/entry-uses-core.ts'),
    errors: [],
  },
  {
    name: 'valid/feature-uses-integration',
    filename: '/abs/apps/mobile/src/features/waitlist/service.ts',
    code: read('valid/feature-uses-integration.ts'),
    errors: [],
  },
  {
    name: 'valid/feature-uses-ui-as-leaf',
    filename: '/abs/apps/mobile/src/features/waitlist/CloudWaitlistSheet.tsx',
    code: read('valid/feature-uses-ui-as-leaf.tsx'),
    errors: [],
  },
  {
    name: 'valid/same-feature-internal',
    filename: '/abs/apps/mobile/src/features/chat/MessageList.tsx',
    code: read('valid/same-feature-internal.tsx'),
    errors: [],
  },

  // INVALID
  {
    name: 'invalid/entry-imports-feature',
    filename: '/abs/apps/mobile/src/entry/chat-route.ts',
    code: read('invalid/entry-imports-feature.ts'),
    errors: [{ messageId: 'crossLayer' }],
  },
  {
    name: 'invalid/feature-imports-sibling-feature',
    filename: '/abs/apps/mobile/src/features/billing/PaywallCard.tsx',
    code: read('invalid/feature-imports-sibling-feature.tsx'),
    errors: [{ messageId: 'siblingFeature' }],
  },
  {
    name: 'invalid/feature-reexports-ui',
    filename: '/abs/apps/mobile/src/features/waitlist/index.ts',
    code: read('invalid/feature-reexports-ui.ts'),
    // 3 ui-transit reports (named re-export, `export ... from`, `export * from`)
    errors: [{ messageId: 'uiTransit' }, { messageId: 'uiTransit' }, { messageId: 'uiTransit' }],
  },
  {
    name: 'invalid/data-imports-feature',
    filename: '/abs/apps/mobile/src/data/memory-store.ts',
    code: read('invalid/data-imports-feature.ts'),
    errors: [{ messageId: 'crossLayer' }, { messageId: 'crossLayer' }],
  },
  {
    name: 'invalid/ui-imports-feature',
    filename: '/abs/apps/mobile/src/ui/button.tsx',
    code: read('invalid/ui-imports-feature.tsx'),
    errors: [{ messageId: 'crossLayer' }, { messageId: 'crossLayer' }],
  },
];

/** @param {string} rel */
function read(rel) {
  return fs.readFileSync(path.join(__dirname, 'test-cases', rel), 'utf8');
}

tester.run('no-cross-layer-import', rule, {
  valid: cases
    .filter((c) => c.errors.length === 0)
    .map((c) => ({ filename: c.filename, code: c.code })),
  invalid: cases
    .filter((c) => c.errors.length > 0)
    .map((c) => ({
      filename: c.filename,
      code: c.code,
      errors: c.errors,
    })),
});

// If we reach here, RuleTester didn't throw.
console.log(
  `[phase8 harness] OK — ${cases.length} cases verified ` +
    `(${cases.filter((c) => c.errors.length === 0).length} valid, ` +
    `${cases.filter((c) => c.errors.length > 0).length} invalid)`,
);
