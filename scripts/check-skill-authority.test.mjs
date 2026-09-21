import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authorityReachedBy,
  authoritySymbols,
  findings,
  skillModules,
} from './check-skill-authority.mjs';

function scratch(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-authority-'));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const OWNERS = [
  { kind: 'connector grant', symbols: ['upsertConnectorOAuthGrant'] },
  { kind: 'tool catalog', symbols: ['loadUserConnectorToolDefs'] },
];

test('the owner module supplies its own writer names', () => {
  const symbols = authoritySymbols(
    `export async function upsertConnectorOAuthGrant() {}
export async function getConnectorOAuthGrant() {}
export function setDefaultConnectorAccount() {}
`,
    [],
  );
  assert.deepEqual(symbols, ['setDefaultConnectorAccount', 'upsertConnectorOAuthGrant']);
});

test('a reader on the owner module is not authority', () => {
  assert.deepEqual(authoritySymbols('export async function listConnectorAccounts() {}', []), []);
});

test('a skill module that writes a grant is reported', () => {
  assert.deepEqual(authorityReachedBy('await upsertConnectorOAuthGrant(db, userId);', OWNERS), [
    'connector grant: upsertConnectorOAuthGrant',
  ]);
});

test('a skill module that loads the offered catalog is reported', () => {
  assert.deepEqual(
    authorityReachedBy('const tools = await loadUserConnectorToolDefs(db);', OWNERS),
    ['tool catalog: loadUserConnectorToolDefs'],
  );
});

test('naming a required tool in frontmatter is not reaching for authority', () => {
  assert.deepEqual(authorityReachedBy("requires: { tools: ['web_search'] }", OWNERS), []);
});

test('a skill service that declares a tool of its own fails', () => {
  const root = scratch({
    'apps/web/lib/services/skill-catalog-service.ts':
      "export const extra = { type: 'function', function: { name: 'shell' } };",
  });
  const { out } = findings(root, OWNERS);
  assert.deepEqual(out, [
    'apps/web/lib/services/skill-catalog-service.ts declares a tool of its own',
  ]);
});

test('the skill tool module may declare the one tool a skill is read through', () => {
  const root = scratch({
    'packages/tools/skills/src/tool.ts':
      "export const skillTool = { type: 'function', function: { name: 'skill' } };",
  });
  assert.deepEqual(findings(root, OWNERS).out, []);
});

test('a skill service reaching a writer fails', () => {
  const root = scratch({
    'apps/web/lib/services/skill-install-service.ts':
      'import { upsertConnectorOAuthGrant } from "@/lib/connectors/oauth-store";',
  });
  const { out } = findings(root, OWNERS);
  assert.equal(out.length, 1);
  assert.match(out[0], /upsertConnectorOAuthGrant/);
});

test('an unrelated service in the same directory is not a skill module', () => {
  const root = scratch({
    'apps/web/lib/services/plugin-lifecycle.ts': 'await upsertConnectorOAuthGrant();',
    'apps/web/lib/services/skill-install-service.ts': 'export const nothing = 1;',
  });
  assert.deepEqual(skillModules(root), ['apps/web/lib/services/skill-install-service.ts']);
  assert.deepEqual(findings(root, OWNERS).out, []);
});

test('a skill test file is not scanned', () => {
  const root = scratch({
    'apps/web/lib/services/skill-install-service.test.ts': 'await upsertConnectorOAuthGrant();',
  });
  assert.deepEqual(skillModules(root), []);
});
