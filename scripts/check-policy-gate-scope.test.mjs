import assert from 'node:assert/strict';
import test from 'node:test';

import { findRequestScopedPolicyResolvers } from './lib/policy-gate-scope.mjs';

function resolver(name, parameters, body) {
  return [`export async function ${name}(`, parameters, `): Promise<Result> {`, body, '}', ''].join(
    '\n',
  );
}

test('flags an account-level resolver that still accepts a request parameter', () => {
  const hits = findRequestScopedPolicyResolvers(
    resolver(
      'resolveMfaPolicy',
      '  db: DatabaseAdapter,\n  userId: string,\n  request?: ScopedRequest,',
      '  return { policy: null, organizationId: null };',
    ),
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /resolveMfaPolicy accepts a request parameter/);
});

test('flags an account-level resolver that resolves scope from the selected workspace', () => {
  const hits = findRequestScopedPolicyResolvers(
    resolver(
      'resolveIpAllowListPolicy',
      '  db: DatabaseAdapter,\n  userId: string,',
      '  const organizationId = await resolveActiveOrganizationId(db, userId);',
    ),
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /resolves its scope with resolveActiveOrganizationId/);
});

test('allows a membership-scoped account-level resolver', () => {
  const hits = findRequestScopedPolicyResolvers(
    resolver(
      'resolveZeroDataRetentionPolicy',
      '  db: DatabaseAdapter,\n  userId: string,',
      '  const ids = await resolveGoverningOrganizationIds(db, userId);',
    ),
  );
  assert.deepEqual(hits, []);
});

test('leaves the content-scope workspace gate alone', () => {
  const hits = findRequestScopedPolicyResolvers(
    resolver(
      'evaluateActiveWorkspacePolicy',
      '  db: DatabaseAdapter,\n  userId: string,\n  ask: PolicyAsk,\n  request?: ScopedRequest,',
      '  const organizationId = await resolveActiveOrganizationId(db, userId, request);',
    ),
  );
  assert.deepEqual(hits, []);
});

test('does not let one resolver body leak into the next', () => {
  const source =
    resolver(
      'resolveMfaPolicy',
      '  db: DatabaseAdapter,\n  userId: string,',
      '  const ids = await resolveGoverningOrganizationIds(db, userId);',
    ) +
    resolver(
      'evaluateActiveWorkspacePolicy',
      '  db: DatabaseAdapter,\n  userId: string,\n  request?: ScopedRequest,',
      '  const organizationId = await resolveActiveOrganizationId(db, userId, request);',
    );
  assert.deepEqual(findRequestScopedPolicyResolvers(source), []);
});

test('reports the line the violation is on', () => {
  const source =
    'const a = 1;\nconst b = 2;\n' +
    resolver(
      'resolveSecretHandlingPolicy',
      '  db: DatabaseAdapter,\n  userId: string,\n  request?: ScopedRequest,',
      '  return { mode: "warn", organizationId: null };',
    );
  assert.equal(findRequestScopedPolicyResolvers(source)[0].line, 3);
});
