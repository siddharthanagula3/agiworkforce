import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PROVIDER_SDK_MODULES,
  importedPackages,
  looksLikeProviderSdk,
  packageOfSpecifier,
  providerSdkViolations,
} from './check-provider-adapter-boundary.mjs';

const PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];

function fixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'provider-adapter-boundary-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function run(files, declared) {
  const repoRoot = fixtureRoot(files);
  return providerSdkViolations({
    repoRoot,
    files: Object.keys(files),
    providers: PROVIDERS,
    declared,
  });
}

test('a specifier resolves to its package, subpath and scope included', () => {
  assert.equal(packageOfSpecifier('openai/resources/chat'), 'openai');
  assert.equal(packageOfSpecifier('@anthropic-ai/sdk/resources'), '@anthropic-ai/sdk');
  assert.equal(packageOfSpecifier('./local'), null);
  assert.equal(packageOfSpecifier('node:fs'), null);
});

test('imports are read from statements, not from code samples in strings', () => {
  const packages = importedPackages(
    [
      "import OpenAI from 'openai';",
      "export { type Thing } from '@anthropic-ai/sdk';",
      "const sample = `import OpenAI from 'openai-in-a-docs-sample';`;",
      "const x = require('groq-sdk');",
    ].join('\n'),
  );
  assert.deepEqual([...packages].sort(), ['@anthropic-ai/sdk', 'groq-sdk', 'openai']);
});

test('a vendor package is recognised by the canonical provider ids', () => {
  assert.equal(looksLikeProviderSdk('openai', PROVIDERS), true);
  assert.equal(looksLikeProviderSdk('@anthropic-ai/sdk', PROVIDERS), true);
  assert.equal(looksLikeProviderSdk('zod', PROVIDERS), false);
  assert.equal(looksLikeProviderSdk('@agiworkforce/providers-openai', PROVIDERS), false);
});

test('an adapter may import its own SDK', () => {
  const violations = run(
    { 'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n" },
    ['openai'],
  );
  assert.deepEqual(violations, []);
});

test('business logic importing a provider SDK is flagged', () => {
  const violations = run(
    {
      'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n",
      'apps/web/lib/services/summary-service.ts': "import OpenAI from 'openai';\n",
    },
    ['openai'],
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /apps\/web\/lib\/services\/summary-service\.ts/);
  assert.match(violations[0], /ProviderTrait/);
});

test('a contracts package importing a provider SDK is flagged', () => {
  const violations = run(
    {
      'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n",
      'packages/contracts/types/src/model.ts': "import type { Model } from 'openai/resources';\n",
    },
    ['openai'],
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /packages\/contracts\/types\/src\/model\.ts/);
});

test('a vendor package an adapter imports without declaring it is flagged', () => {
  const violations = run(
    {
      'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n",
      'packages/ai/providers/xai/src/index.ts': "import Grok from 'xai-sdk';\n",
    },
    ['openai'],
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /xai-sdk/);
  assert.match(violations[0], /PROVIDER_SDK_MODULES/);
});

test('a declared SDK no adapter imports any more is flagged', () => {
  const violations = run(
    { 'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n" },
    ['openai', '@anthropic-ai/sdk'],
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /@anthropic-ai\/sdk/);
});

test('tests and type declarations are not product code', () => {
  const violations = run(
    {
      'packages/ai/providers/openai/src/index.ts': "import OpenAI from 'openai';\n",
      'apps/web/lib/__tests__/wire-parity.test.ts': "import OpenAI from 'openai';\n",
      'apps/web/lib/vendor.d.ts': "import OpenAI from 'openai';\n",
    },
    ['openai'],
  );
  assert.deepEqual(violations, []);
});

test('the guard runs against a declared list the repository actually has', () => {
  assert.ok(PROVIDER_SDK_MODULES.includes('openai'));
  assert.ok(PROVIDER_SDK_MODULES.includes('@anthropic-ai/sdk'));
});
