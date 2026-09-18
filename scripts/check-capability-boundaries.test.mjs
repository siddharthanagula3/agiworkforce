import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITY_LITERAL_ALLOWLIST,
  PROVIDER_ADAPTER_PATHS,
  PROVIDER_BRANCH_ALLOWLIST,
  capabilityLiteralViolations,
  platformCapabilities,
  providerBranchPattern,
  providerIdentityViolations,
  providerIds,
  slashCommandViolations,
} from './check-capability-boundaries.mjs';

const CAPABILITIES = ['canUseWebSearch', 'canUseDeepResearch', 'canUseConnectors'];
const PROVIDERS = ['openai', 'anthropic', 'google'];

function fixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'capability-boundaries-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

test('the guard reads its vocabularies from the contracts', () => {
  assert.ok(platformCapabilities().includes('canUseWebSearch'));
  assert.ok(providerIds().includes('openai'));
});

test('a client that decides capabilities from literals is flagged', () => {
  const file = 'apps/web/features/chat/components/ToolRow.tsx';
  const root = fixtureRoot({
    [file]:
      "const enabled = mode === 'canUseWebSearch' || mode === 'canUseDeepResearch' || mode === 'canUseConnectors';\n",
  });

  const violations = capabilityLiteralViolations({
    repoRoot: root,
    files: [file],
    capabilities: CAPABILITIES,
  });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /capability handshake/);
});

test('a client that reads the handshake may name capabilities', () => {
  const file = 'apps/web/features/chat/components/ToolRow.tsx';
  const root = fixtureRoot({
    [file]:
      "import { isCapabilityEnabled } from '@agiworkforce/types';\n" +
      "const tools = ['canUseWebSearch', 'canUseDeepResearch', 'canUseConnectors'] as const;\n" +
      "const enabled = tools.filter((tool) => isCapabilityEnabled('web', tool));\n",
  });

  assert.deepEqual(
    capabilityLiteralViolations({ repoRoot: root, files: [file], capabilities: CAPABILITIES }),
    [],
  );
});

test('two capability literals are below the floor', () => {
  const file = 'apps/web/features/chat/components/ToolRow.tsx';
  const root = fixtureRoot({
    [file]: "const enabled = mode === 'canUseWebSearch' || mode === 'canUseConnectors';\n",
  });

  assert.deepEqual(
    capabilityLiteralViolations({ repoRoot: root, files: [file], capabilities: CAPABILITIES }),
    [],
  );
});

test('business logic branching on provider identity is flagged', () => {
  const file = 'apps/web/lib/services/turn-service.ts';
  const root = fixtureRoot({
    [file]: "export function canStream(provider: string) {\n  return provider === 'openai';\n}\n",
  });

  const violations = providerIdentityViolations({
    repoRoot: root,
    files: [file],
    providers: PROVIDERS,
  });

  assert.equal(violations.length, PROVIDER_BRANCH_ALLOWLIST.size + 1);
  assert.match(violations[0], /provider-adapter\.ts/);
  assert.match(violations[0], /turn-service\.ts:2/);
});

test('a commented provider comparison is not a branch', () => {
  const file = 'apps/web/lib/services/turn-service.ts';
  const root = fixtureRoot({
    [file]: "// provider === 'openai' used to decide this\nexport const canStream = true;\n",
  });

  const violations = providerIdentityViolations({
    repoRoot: root,
    files: [file],
    providers: PROVIDERS,
  });

  assert.deepEqual(
    violations.filter((violation) => violation.startsWith(file)),
    [],
  );
});

test('an allowlisted entry that stopped branching has to be dropped', () => {
  const [tracked] = [...PROVIDER_BRANCH_ALLOWLIST.keys()];
  const root = fixtureRoot({ [tracked]: 'export const nothing = true;\n' });

  const violations = providerIdentityViolations({
    repoRoot: root,
    files: [tracked],
    providers: PROVIDERS,
  });

  assert.ok(violations.some((violation) => /may only shrink/.test(violation)));
});

test('the pattern matches both operand orders and neither allowlist overlaps', () => {
  const pattern = providerBranchPattern(PROVIDERS);
  assert.ok(pattern.test("if (model.provider === 'anthropic') {"));
  assert.ok(pattern.test("if ('google' !== resolvedProvider) {"));
  assert.ok(!pattern.test("const label = 'openai';"));

  for (const file of PROVIDER_ADAPTER_PATHS.keys()) {
    assert.ok(!PROVIDER_BRANCH_ALLOWLIST.has(file), `${file} is both an adapter and tracked debt`);
  }
  for (const [, why] of [...PROVIDER_ADAPTER_PATHS, ...PROVIDER_BRANCH_ALLOWLIST]) {
    assert.ok(why.length > 20);
  }
  assert.equal(CAPABILITY_LITERAL_ALLOWLIST.size, 0);
});

test('a composer that hardcodes slash commands is still flagged', () => {
  const file = 'apps/web/features/chat/components/Composer/SlashMenu.tsx';
  const root = fixtureRoot({
    [file]: "const commands = ['/image', '/voice', '/compare', '/export'];\n",
  });

  const violations = slashCommandViolations({ repoRoot: root, files: [file] });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /BUILT_IN_SLASH_COMMANDS/);
});
