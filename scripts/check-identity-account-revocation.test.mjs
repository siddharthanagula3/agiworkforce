import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONFIG_PATH,
  LIFECYCLE,
  STATUS_VOCABULARY,
  dominates,
  functionBody,
  ungatedReturns,
} from './check-identity-account-revocation.mjs';
import { ROUTE_GATE } from './check-membership-revocation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-identity-account-revocation.mjs');

const GATE = `
import { verifyDeveloperTokenSignature } from '@/lib/server/device-tokens';
import { getRequestIdentity } from '@/lib/server/identity';
import { accountAccessDecision } from '@/lib/auth/account-status';
import { readAccountStatus } from '@/lib/auth/account-lifecycle';

function assertStatusAllowsAccess(status: string | null): void {
  const decision = accountAccessDecision(status);
  if (decision.allowed) return;
  throw new Error(decision.message);
}

export async function assertAccountActive(userId: string): Promise<void> {
  assertStatusAllowsAccess(await readAccountStatus(userId));
}

async function verifyBearerToken(token: string) {
  const developerToken = verifyDeveloperTokenSignature(token);
  if (developerToken) return { userId: developerToken.userId };
  return null;
}

async function verifyApiKey(token: string) {
  const key = await ApiKeyService.verifyKey(token);
  return key ? { userId: key.user_id } : null;
}

export async function getClerkAuthUser(request: NextRequest, options: AuthOptions = {}) {
  const header = request.headers.get('authorization');
  if (header) {
    const apiKey = await verifyApiKey(header);
    if (apiKey) {
      await assertAccountActive(apiKey.userId);
      return apiKey;
    }
    const bearer = await verifyBearerToken(header);
    if (bearer) {
      await assertAccountActive(bearer.userId);
      return bearer;
    }
    return null;
  }
  const { subject } = await getRequestIdentity();
  if (subject) {
    await assertAccountActive(subject);
    return { userId: subject };
  }
  return null;
}
`;

const VOCABULARY = `
export const ACCOUNT_STATUSES = ['active', 'suspended', 'deleted'] as const;

export function accountAccessDecision(status: string | null) {
  switch (status) {
    case 'suspended':
      return { allowed: false, message: 'suspended' };
    case 'deleted':
      return { allowed: false, message: 'deleted' };
    default:
      return { allowed: true };
  }
}
`;

const CONFIG = JSON.stringify(
  { statusesDeliberatelyAllowed: [{ status: 'active', reason: 'the ordinary state' }] },
  null,
  2,
);

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'account-revocation-'));
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

const tree = (overrides = {}) => ({
  [ROUTE_GATE]: GATE,
  [STATUS_VOCABULARY]: VOCABULARY,
  [LIFECYCLE]: 'export async function readAccountStatus(id: string) { return null; }',
  [CONFIG_PATH]: CONFIG,
  ...overrides,
});

test('a gate that runs the account check on every way in passes', () => {
  withTree(tree(), (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 0, output);
    assert.match(output, /3 account statuses, 1 deliberately allowed/);
  });
});

test('one credential class that skips the account check fails', () => {
  withTree(
    tree({ [ROUTE_GATE]: GATE.replace('      await assertAccountActive(apiKey.userId);\n', '') }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /without assertAccountActive having run first/);
      assert.match(output, /return apiKey/);
    },
  );
});

test('a check in a sibling branch does not cover the branch beside it', () => {
  const moved = GATE.replace(
    '    const bearer = await verifyBearerToken(header);',
    '    await assertAccountActive("someone-else");\n    const bearer = await verifyBearerToken(header);',
  ).replace('      await assertAccountActive(apiKey.userId);\n', '');
  withTree(tree({ [ROUTE_GATE]: moved }), (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /return apiKey/);
  });
});

test('a status the decision never answers fails unless it is recorded as allowed', () => {
  withTree(
    tree({
      [STATUS_VOCABULARY]: VOCABULARY.replace(
        "['active', 'suspended', 'deleted']",
        "['active', 'dormant', 'suspended', 'deleted']",
      ),
    }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /no case for "dormant"/);
      assert.match(output, /falls through to the default/);
    },
  );
});

test('a status recorded as allowed with no reason fails', () => {
  withTree(
    tree({
      [CONFIG_PATH]: JSON.stringify({ statusesDeliberatelyAllowed: [{ status: 'active' }] }),
    }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /allowed here with no reason given/);
    },
  );
});

test('a status the decision now answers may not stay on the allowed list', () => {
  withTree(
    tree({
      [STATUS_VOCABULARY]: VOCABULARY.replace(
        "    case 'suspended':",
        "    case 'active':\n      return { allowed: true };\n    case 'suspended':",
      ),
    }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /Remove the entry so the list can only shrink/);
    },
  );
});

test('a status no longer in the vocabulary may not stay on the allowed list', () => {
  withTree(
    tree({
      [CONFIG_PATH]: JSON.stringify({
        statusesDeliberatelyAllowed: [
          { status: 'active', reason: 'the ordinary state' },
          { status: 'hibernating', reason: 'stale' },
        ],
      }),
    }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /hibernating is no longer an account status/);
    },
  );
});

test('a gate that stops deciding through the shared vocabulary fails', () => {
  withTree(
    tree({
      [ROUTE_GATE]: GATE.replace('accountAccessDecision(status)', 'status !== "suspended"').replace(
        "import { accountAccessDecision } from '@/lib/auth/account-status';",
        '',
      ),
    }),
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /no longer decides through accountAccessDecision/);
    },
  );
});

test('a missing gate, vocabulary or lifecycle module fails rather than reporting nothing', () => {
  withTree(tree({ [ROUTE_GATE]: null }), (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /must all exist/);
  });
});

test('dominance is textual order at no greater depth with no block closed between', () => {
  const source = 'a{b;c;}d';
  assert.equal(dominates(source, 2, 4), true);
  assert.equal(dominates(source, 4, 2), false);
  assert.equal(dominates(source, 2, 7), false);
});

test('a function body starts after its parameter list, not at a default value', () => {
  const found = functionBody('export function f(options: Options = {}) {\n  return 1;\n}\n', 'f');
  assert.match(found.body, /return 1/);
});

test('a return of null is not a principal', () => {
  assert.deepEqual(ungatedReturns('function f() {\n  return null;\n}\n', 'f'), []);
});
