import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CREDENTIAL_AGE_BOUNDS,
  POLICY_ENV,
  POLICY_MODULE,
  REPO_ROOT,
  ROUTE_GATE,
  UNBOUNDED_CREDENTIALS,
  checkSessionLifetimeEnforcement,
  credentialVerifiers,
} from './check-session-lifetime-enforcement.mjs';

const roots = [];

const GATE = [
  "import { assertSessionWithinAbsoluteLifetime } from '@/lib/auth/session-age';",
  "import { verifyDeveloperTokenSignature } from '@/lib/server/developer-token';",
  "import { getRequestIdentity } from '@/lib/server/identity';",
  'async function verifyBearerToken(token) {',
  '  const developerToken = verifyDeveloperTokenSignature(token);',
  '  return identity.verifySessionToken(token, {});',
  '}',
  'export async function getClerkAuthUser(request) {',
  '  await ApiKeyService.verifyKey(token);',
  '  await verifyBearerToken(token);',
  '  const { subject, sessionId } = await getRequestIdentity();',
  '  await assertSessionWithinAbsoluteLifetime(sessionId, subject);',
  '}',
].join('\n');

const POLICY = `export const SESSION_ABSOLUTE_LIFETIME_HOURS_ENV = '${POLICY_ENV}';\n`;

const BOUNDS = [
  {
    verifier: 'verifyKey',
    credential: 'an API key',
    boundedIn: 'lib/api-key-service.ts',
    proves: /expires_at IS NULL OR expires_at > now\(\)/i,
    why: 'the key row is returned only while it is unrevoked and unexpired',
  },
  {
    verifier: 'verifyDeveloperTokenSignature',
    credential: 'a device access token',
    boundedIn: 'lib/developer-token.ts',
    proves: /expires_at > now\(\)/i,
    why: 'the token is honoured only while its refresh family still holds a live row',
  },
];

const SESSION_BOUNDS = [
  {
    verifier: 'verifySessionToken',
    credential: 'a provider session token',
    boundedIn: 'lib/session-age.ts',
    proves: /hasOutlivedAbsoluteLifetime\(/,
    why: 'the session start is measured against the absolute lifetime',
    calledFromGate: /assertSessionWithinAbsoluteLifetime\(/,
  },
  {
    verifier: 'getRequestIdentity',
    credential: 'the browser session cookie',
    boundedIn: 'lib/session-age.ts',
    proves: /hasOutlivedAbsoluteLifetime\(/,
    why: 'the session start is measured against the absolute lifetime',
    calledFromGate: /assertSessionWithinAbsoluteLifetime\(/,
  },
];

const UNBOUNDED = [];

function tree(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'session-lifetime-'));
  roots.push(root);
  const files = {
    'lib/api-auth.ts': GATE,
    'lib/session-policy.ts': POLICY,
    'lib/api-key-service.ts': "const SQL = 'expires_at IS NULL OR expires_at > now()';\n",
    'lib/developer-token.ts': "const SQL = 'expires_at > now()';\n",
    'lib/session-age.ts': 'export const past = hasOutlivedAbsoluteLifetime(startedAt, now);\n',
    ...overrides,
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

function check(overrides = {}, options = {}) {
  return checkSessionLifetimeEnforcement(tree(overrides), {
    gate: 'lib/api-auth.ts',
    policy: 'lib/session-policy.ts',
    roots: ['lib'],
    bounds: [...BOUNDS, ...SESSION_BOUNDS],
    unbounded: UNBOUNDED,
    ...options,
  });
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a gate whose every credential class is answered passes', () => {
  const { errors, report } = check();
  assert.deepEqual(errors, []);
  assert.equal(report.verifiers, 4);
  assert.equal(report.bounded, 4);
  assert.equal(report.unbounded, 0);
});

test('a bound the gate stopped asking for is code nothing runs', () => {
  const { errors } = check({
    'lib/api-auth.ts': GATE.replace(
      '  await assertSessionWithinAbsoluteLifetime(sessionId, subject);\n',
      '',
    ),
  });
  assert.ok(errors.length >= 1, 'a bound nothing calls passed');
  assert.match(errors.join('\n'), /the gate no longer asks it/);
});

test('reads the credential classes out of the gate, not out of a list', () => {
  const verifiers = credentialVerifiers(GATE);
  assert.deepEqual(verifiers, [
    'getRequestIdentity',
    'verifyDeveloperTokenSignature',
    'verifyKey',
    'verifySessionToken',
  ]);
});

test('a fifth way in that nobody classified fails', () => {
  const { errors } = check({
    'lib/api-auth.ts': `${GATE}\nconst extra = await verifySignedLinkToken(token);\n`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /verifySignedLinkToken/);
  assert.match(errors[0], /how long that credential may keep working/);
});

test('a bound that its own module no longer proves fails', () => {
  const { errors } = check({ 'lib/developer-token.ts': "const SQL = 'select 1';\n" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer bounds a device access token/);
});

test('a bound naming a module that is gone fails', () => {
  const { errors } = check({ 'lib/api-key-service.ts': null });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not exist/);
});

test('an entry for a credential class the gate stopped calling fails', () => {
  const { errors } = check({
    'lib/api-auth.ts': GATE.replace('await ApiKeyService.verifyKey(token);', ''),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /verifyKey is classified here/);
});

test('the unbounded record goes stale the moment the gate consults the policy', () => {
  const { errors } = check(
    {},
    {
      bounds: BOUNDS,
      unbounded: [
        {
          verifier: 'verifySessionToken',
          credential: 'a provider session token',
          reliesOn: 'the provider refuses a token past its own short expiry, which renews on use',
        },
        {
          verifier: 'getRequestIdentity',
          credential: 'the browser session cookie',
          reliesOn: 'the provider refuses a token past its own short expiry, which renews on use',
        },
      ],
    },
  );
  assert.match(errors.join('\n'), /no longer unbounded/);
});

test('an unbounded credential with a one-word reason fails', () => {
  const { errors } = check(
    {},
    {
      bounds: BOUNDS,
      unbounded: [
        {
          verifier: 'verifySessionToken',
          credential: 'a provider session token',
          reliesOn: 'the provider refuses a token past its own short expiry, which renews on use',
        },
        { verifier: 'getRequestIdentity', credential: 'the cookie', reliesOn: 'the provider' },
      ],
    },
  );
  assert.match(errors.join('\n'), /stated in full/);
});

test('a second module reading the lifetime directly fails the single source rule', () => {
  const { errors } = check({
    'lib/middleware-gate.ts': `const hours = process.env['${POLICY_ENV}'];\n`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /One module answers how long a session may last/);
});

test('a policy module that stopped declaring the lifetime fails', () => {
  const { errors } = check({ 'lib/session-policy.ts': 'export const nothing = 1;\n' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], new RegExp(`no longer declares ${POLICY_ENV}`));
});

test('a gate that no longer verifies anything fails rather than passing empty', () => {
  const { errors } = check({ 'lib/api-auth.ts': 'export const nothing = 1;\n' });
  assert.ok(
    errors.some((error) => /no credential verifier found/.test(error)),
    errors.join('\n'),
  );
});

test('the repository itself passes, with every real credential class accounted for', () => {
  const { errors, report } = checkSessionLifetimeEnforcement();
  assert.deepEqual(errors, []);
  assert.equal(report.verifiers, CREDENTIAL_AGE_BOUNDS.length + UNBOUNDED_CREDENTIALS.length);
  assert.equal(report.unbounded, 0, 'a credential class is keeping working past the lifetime');
  assert.ok(report.verifiers >= 4, `${ROUTE_GATE} yielded ${report.verifiers} credential classes`);
  assert.equal(report.policyReferences >= 1, true, POLICY_MODULE);
});
