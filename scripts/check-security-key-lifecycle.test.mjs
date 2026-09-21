import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  handlesKeyMaterial,
  isLifecycleOperation,
  readWorkspaceSealedStores,
} from './check-security-key-lifecycle.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-security-key-lifecycle.mjs');

const KEY_MODULE = `
import { sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

export async function readWorkspaceKey(id: string) {
  return { id };
}

export async function rotateWorkspaceKey(ring: KeyRing, id: string) {
  return sealEnvelope(ring, id, 'versioned');
}
`;

const CALLER = `
import { rotateWorkspaceKey } from '@/lib/server/workspace-keys';

export async function POST() {
  return rotateWorkspaceKey(ring, 'workspace');
}
`;

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'key-lifecycle-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      if (contents === null) continue;
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(root) {
  try {
    return { code: 0, output: execFileSync('node', [guard, '--root', root], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('a rotation nothing calls fails', () => {
  withTree({ 'apps/web/lib/server/workspace-keys.ts': KEY_MODULE }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /workspace-keys\.ts::rotateWorkspaceKey/);
    assert.match(output, /nothing outside its own tests calls it/);
  });
});

test('its own test is not a caller', () => {
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'apps/web/lib/server/workspace-keys.test.ts': CALLER,
      'apps/web/lib/server/__tests__/keys.test.ts': CALLER,
    },
    (root) => assert.equal(runGuard(root).code, 1),
  );
});

test('the same rotation passes once a route calls it', () => {
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'apps/web/app/api/keys/route.ts': CALLER,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
      assert.match(output, /1 lifecycle operations/);
    },
  );
});

test('a reader with no caller is not the subject', () => {
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE.replace(
        'export async function rotateWorkspaceKey',
        'export async function describeWorkspaceKey',
      ),
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a module that never touches key material is not the subject', () => {
  withTree(
    {
      'apps/web/lib/server/rotation-copy.ts':
        'export function rotateBanner(id: string) {\n  return id;\n}\n',
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a baseline entry excuses exactly one operation and needs a reason and an owner', () => {
  const baseline = (entry) => JSON.stringify({ unreachable: [entry] });
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'scripts/config/security-key-lifecycle-baseline.json': baseline({
        module: 'apps/web/lib/server/workspace-keys.ts',
        name: 'rotateWorkspaceKey',
        reason: 'no surface enrols a key yet',
        owner: 'apps/web/app/api/keys/route.ts',
      }),
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'scripts/config/security-key-lifecycle-baseline.json': baseline({
        module: 'apps/web/lib/server/workspace-keys.ts',
        name: 'rotateWorkspaceKey',
      }),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /needs both a reason and the file/);
    },
  );
});

test('a baseline entry that has since been wired fails so the list only shrinks', () => {
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'apps/web/app/api/keys/route.ts': CALLER,
      'scripts/config/security-key-lifecycle-baseline.json': JSON.stringify({
        unreachable: [
          {
            module: 'apps/web/lib/server/workspace-keys.ts',
            name: 'rotateWorkspaceKey',
            reason: 'stale',
            owner: 'apps/web/app/api/keys/route.ts',
          },
        ],
      }),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /which now has a caller/);
    },
  );
});

test('an empty tree fails rather than reporting success', () => {
  withTree({ 'README.md': 'nothing' }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /no source file was found/);
  });
});

test('a neutral prefix hands the question to the verb behind it', () => {
  assert.equal(isLifecycleOperation('rotateOrganizationKey'), true);
  assert.equal(isLifecycleOperation('runOrganizationKeyRewrap'), true);
  assert.equal(isLifecycleOperation('readOrganizationKeyRecord'), false);
  assert.equal(isLifecycleOperation('organizationKeyRing'), false);
  assert.equal(isLifecycleOperation('runMigration'), false);
});

test('the crypto directory is a subject whatever it imports', () => {
  assert.equal(
    handlesKeyMaterial('apps/web/lib/crypto/platform-keys.ts', 'export const a = 1;'),
    true,
  );
  assert.equal(handlesKeyMaterial('apps/web/lib/services/x.ts', 'export const a = 1;'), false);
  assert.equal(
    handlesKeyMaterial(
      'apps/web/lib/services/x.ts',
      "import { openEnvelope } from '@/lib/crypto/envelope';",
    ),
    true,
  );
});

const SEALING_MODULE = `
import { organizationKeyRing } from '@/lib/server/organization-encryption-keys';
import { sealEnvelope } from '@/lib/crypto/envelope';

export async function saveDestination(db, organizationId, secret) {
  const { ring } = await organizationKeyRing(db, organizationId);
  const ciphertext = sealEnvelope(ring, secret, 'versioned', \`audit-destination:\${organizationId}\`);
  return db.execute('update public.audit_destinations set secret_ciphertext = $1', [ciphertext]);
}
`;

function registry(entries) {
  return `
export interface WorkspaceSealedStore {
  readonly module: string;
}

export const WORKSPACE_SEALED_STORES: readonly WorkspaceSealedStore[] = [
${entries}
];
`;
}

const AUDIT_ENTRY = `  {
    module: 'apps/web/lib/services/audit.ts',
    table: 'public.audit_destinations',
    column: 'secret_ciphertext',
    keyColumn: 'organization_id',
    organizationColumn: 'organization_id',
    contextPrefix: 'audit-destination:',
  },`;

test('a column sealed under a workspace ring that the registry does not name fails', () => {
  withTree(
    {
      'apps/web/lib/services/audit.ts': SEALING_MODULE,
      'apps/web/lib/crypto/connector-secret-reseal.ts': registry(''),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /audit\.ts seals a value under a workspace key ring/);
      assert.match(output, /sealed under the version it then retires/);
    },
  );
});

test('the same column passes once the registry names it', () => {
  withTree(
    {
      'apps/web/lib/services/audit.ts': SEALING_MODULE,
      'apps/web/lib/crypto/connector-secret-reseal.ts': registry(AUDIT_ENTRY),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
      assert.match(output, /1 workspace-sealed column\(s\) in 1 module\(s\)/);
    },
  );
});

test('a registry entry whose column the module never writes fails', () => {
  withTree(
    {
      'apps/web/lib/services/audit.ts': SEALING_MODULE,
      'apps/web/lib/crypto/connector-secret-reseal.ts': registry(
        AUDIT_ENTRY.replace("column: 'secret_ciphertext'", "column: 'signing_secret_enc'"),
      ),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /the column "signing_secret_enc", which does not appear in it/);
    },
  );
});

test('a registry entry for a module that no longer seals fails', () => {
  withTree(
    {
      'apps/web/lib/crypto/connector-secret-reseal.ts': registry(AUDIT_ENTRY),
      'apps/web/lib/services/other.ts': 'export const nothing = 1;\n',
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /which no longer seals under a workspace key ring/);
    },
  );
});

test('the registry reads back the fields the rewrap needs', () => {
  const [store] = readWorkspaceSealedStores(registry(AUDIT_ENTRY));
  assert.deepEqual(store, {
    module: 'apps/web/lib/services/audit.ts',
    table: 'public.audit_destinations',
    column: 'secret_ciphertext',
    contextPrefix: 'audit-destination:',
  });
  assert.deepEqual(readWorkspaceSealedStores('export const a = 1;'), []);
});

test('a maintenance script is a caller, which is what the failure text offers', () => {
  withTree(
    {
      'apps/web/lib/server/workspace-keys.ts': KEY_MODULE,
      'scripts/rotate-workspace-keys.mjs':
        "const { rotateWorkspaceKey } = await import('../apps/web/lib/server/workspace-keys.ts');\n",
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
    },
  );
});

test('a guard that only names the symbols is not a sealing module', () => {
  withTree(
    {
      'apps/web/lib/crypto/connector-secret-reseal.ts': registry(''),
      'scripts/check-something.mjs':
        "const CALL = 'organizationKeyRing(';\nconst SEAL = 'sealEnvelope(';\nconsole.log(CALL, SEAL);\n",
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 0, output);
    },
  );
});
