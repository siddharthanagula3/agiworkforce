import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { handlesKeyMaterial, isLifecycleOperation } from './check-security-key-lifecycle.mjs';

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
