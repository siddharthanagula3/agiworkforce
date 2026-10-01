import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/mobile-intent-tokens');

const { mockRevokeEvery, mockRevokeTokens, mockAudit } = vi.hoisted(() => ({
  mockRevokeEvery: vi.fn(),
  mockRevokeTokens: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockAudit }));
vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  revokeEveryMobileIntentToken: (...args: unknown[]) => mockRevokeEvery(...args),
  revokeMobileIntentTokens: (...args: unknown[]) => mockRevokeTokens(...args),
}));

import { finishIntentRevocation, revokeEveryOtherSession } from '../session-revocation';
import { revokeEveryDeviceRefreshCredential } from '../refresh-token-family';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const SWEEP_CALLS = new Set(['listUserSessions', 'setPassword']);
const INTENT_REVOKING_CALLS = new Set([
  'revokeEveryOtherSession',
  'revokeEveryDeviceRefreshCredential',
  'revokeEveryMobileIntentToken',
  'revokeMobileIntentTokens',
  'revokeOrganizationMobileIntentTokens',
  'revokeSessionMobileIntentTokens',
]);
const CHOKEPOINT_MODULES = new Set([
  'lib/server/session-revocation.ts',
  'lib/server/refresh-token-family.ts',
]);
const SINGLE_SESSION_MODULES = new Set(['lib/auth/session-age.ts']);
const INTERESTING_CALL_NAMES = new Set([
  ...SWEEP_CALLS,
  ...INTENT_REVOKING_CALLS,
  'finishIntentRevocation',
  'incomplete',
]);
const calledNamesCache = new Map<string, { contents: Buffer; names: Set<string> }>();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function calledNames(path: string): Set<string> {
  const contents = readFileSync(path);
  const cached = calledNamesCache.get(path);
  if (cached && contents.equals(cached.contents)) return cached.names;
  const text = contents.toString('utf8');
  if (!text.includes('\\') && ![...INTERESTING_CALL_NAMES].some((name) => text.includes(name))) {
    calledNamesCache.delete(path);
    return new Set();
  }
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    } else if (ts.isPropertyAccessExpression(node) && node.name.text === 'incomplete') {
      names.add('.incomplete');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  calledNamesCache.set(path, { contents, names });
  return names;
}

function assertIntentRevocations(root: string) {
  const missing = [...sourceFiles(join(root, 'lib')), ...sourceFiles(join(root, 'app'))]
    .map((path) => ({ path: relative(root, path), calls: calledNames(path) }))
    .filter(({ path }) => !SINGLE_SESSION_MODULES.has(path) && !CHOKEPOINT_MODULES.has(path))
    .filter(({ calls }) => [...SWEEP_CALLS].some((name) => calls.has(name)))
    .filter(({ calls }) => ![...INTENT_REVOKING_CALLS].some((name) => calls.has(name)))
    .map(({ path }) => path);
  expect(missing).toEqual([]);
}

function assertIncompleteSweeps(root: string) {
  const ignoring = [...sourceFiles(join(root, 'lib')), ...sourceFiles(join(root, 'app'))]
    .map((path) => ({ path: relative(root, path), calls: calledNames(path) }))
    .filter(({ path }) => !CHOKEPOINT_MODULES.has(path))
    .filter(({ calls }) => calls.has('revokeEveryOtherSession'))
    .filter(({ calls }) => !calls.has('finishIntentRevocation') && !calls.has('.incomplete'))
    .map(({ path }) => path);
  expect(ignoring).toEqual([]);
}

function withGuardSource(source: string, verify: (root: string, path: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mobile-intent-revocation-'));
  const path = join(root, 'lib', 'caller.tsx');
  mkdirSync(join(root, 'lib'));
  mkdirSync(join(root, 'app'));
  try {
    writeFileSync(path, source);
    verify(root, path);
  } finally {
    calledNamesCache.delete(path);
    rmSync(root, { recursive: true, force: true });
  }
}

function identity(sessions: { id: string }[] = []) {
  const order: string[] = [];
  mockRevokeEvery.mockImplementation(async () => {
    order.push('intent');
  });
  return {
    order,
    operations: {
      listUserSessions: vi.fn(async () => {
        order.push('list');
        return { sessions: sessions.splice(0), totalCount: sessions.length };
      }),
      revokeSession: vi.fn(async () => {
        order.push('revoke');
      }),
    },
  };
}

describe('Ask from Siri tokens end with the sessions they stand beside', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevokeEvery.mockReset();
  });

  it('the session sweep revokes intent tokens after the provider sessions', async () => {
    const { order, operations } = identity([{ id: 'sess_a' }]);
    const sweep = await revokeEveryOtherSession(operations as never, 'user-1', null);
    expect(order).toEqual(['list', 'revoke', 'list', 'intent']);
    expect(mockRevokeEvery).toHaveBeenCalledWith('user-1');
    expect(sweep.incomplete).toBe(false);
  });

  it('an intent revoke failure never skips session revocation and marks the sweep incomplete', async () => {
    const { operations } = identity([{ id: 'sess_a' }]);
    mockRevokeEvery.mockRejectedValue(new Error('db down'));
    const sweep = await revokeEveryOtherSession(operations as never, 'user-1', null);
    expect(operations.revokeSession).toHaveBeenCalledWith('sess_a');
    expect(sweep.incomplete).toBe(true);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'session_revoked',
        outcome: 'failure',
      }),
    );
  });

  it('intent tokens are still revoked when the provider sweep throws', async () => {
    const { operations } = identity();
    operations.listUserSessions.mockRejectedValue(new Error('provider down'));
    await expect(revokeEveryOtherSession(operations as never, 'user-1', null)).rejects.toThrow(
      'provider down',
    );
    expect(mockRevokeEvery).toHaveBeenCalledWith('user-1');
  });

  it('the refresh-credential sweep revokes every intent token', async () => {
    const db = { query: vi.fn().mockResolvedValue([]) };
    await revokeEveryDeviceRefreshCredential(db as never, 'user-1');
    expect(mockRevokeTokens).toHaveBeenCalledWith(db, 'user-1', null);
  });

  it('every module that calls a session or password sweep also calls an intent revocation', () => {
    assertIntentRevocations(WEB_ROOT);
  });

  it('an incomplete sweep retries the intent revoke and reports whether it held', async () => {
    const sweep = {
      ended: [],
      alreadyGone: [],
      failed: [],
      currentSession: undefined,
      targetCount: 0,
    };
    await expect(finishIntentRevocation({ ...sweep, incomplete: false }, 'user-1')).resolves.toBe(
      true,
    );
    expect(mockRevokeEvery).not.toHaveBeenCalled();

    mockRevokeEvery.mockResolvedValueOnce(undefined);
    await expect(finishIntentRevocation({ ...sweep, incomplete: true }, 'user-1')).resolves.toBe(
      true,
    );
    mockRevokeEvery.mockRejectedValueOnce(new Error('db down'));
    await expect(finishIntentRevocation({ ...sweep, incomplete: true }, 'user-1')).resolves.toBe(
      false,
    );
  });

  it('every caller of the session sweep acts on an incomplete result', () => {
    assertIncompleteSweeps(WEB_ROOT);
  });

  it.each([
    ['identifier', 'setPassword()'],
    ['Unicode identifier', String.raw`set\u0050assword()`],
    ['Unicode property', String.raw`accounts.listUser\u0053essions()`],
    ['dot comments', 'accounts. /* gap */ listUserSessions()'],
    ['optional chain', 'accounts?.listUserSessions?.()'],
    ['template expression', 'const value = `${setPassword()}`'],
    ['JSX expression', 'const view = <span>{setPassword()}</span>'],
    ['generic call', 'setPassword<{ name: string }>()'],
  ])(
    'the real revocation guard rejects an unrevoked %s and accepts its repaired caller',
    (_label, call) => {
      withGuardSource(`${call};`, (root, path) => {
        expect(
          calledNames(path).has('setPassword') || calledNames(path).has('listUserSessions'),
        ).toBe(true);
        expect(() => assertIntentRevocations(root)).toThrow();
        writeFileSync(path, `${call};\nrevokeEveryMobileIntentToken();`);
        expect(calledNames(path).has('revokeEveryMobileIntentToken')).toBe(true);
        expect(() => assertIntentRevocations(root)).not.toThrow();
      });
    },
  );

  it.each([
    ['identifier', 'revokeEveryOtherSession()'],
    ['Unicode identifier', String.raw`revokeEveryOther\u0053ession()`],
    ['Unicode property', String.raw`sessions.revokeEveryOther\u0053ession()`],
    ['dot comments', 'sessions. /* gap */ revokeEveryOtherSession()'],
    ['optional chain', 'sessions?.revokeEveryOtherSession?.()'],
    ['template expression', 'const value = `${revokeEveryOtherSession()}`'],
  ])(
    'the real incomplete-sweep guard rejects an ignored %s and accepts its repaired caller',
    (_label, call) => {
      withGuardSource(`${call};`, (root, path) => {
        expect(calledNames(path).has('revokeEveryOtherSession')).toBe(true);
        expect(() => assertIncompleteSweeps(root)).toThrow();
        writeFileSync(path, `${call};\nfinishIntentRevocation();`);
        expect(calledNames(path).has('finishIntentRevocation')).toBe(true);
        expect(() => assertIncompleteSweeps(root)).not.toThrow();
      });
    },
  );

  it.each([
    ['dot whitespace', 'sweep . \n incomplete'],
    ['dot comments', 'sweep. /* gap */ incomplete'],
    ['Unicode property', String.raw`sweep.\u0069ncomplete`],
    ['optional property', 'sweep?.incomplete'],
  ])(
    'the real incomplete-sweep guard recognizes %s without requiring an adjacent dot',
    (_label, observation) => {
      withGuardSource('revokeEveryOtherSession();', (root, path) => {
        expect(() => assertIncompleteSweeps(root)).toThrow();
        writeFileSync(path, `revokeEveryOtherSession();\n${observation};`);
        expect(calledNames(path).has('.incomplete')).toBe(true);
        expect(() => assertIncompleteSweeps(root)).not.toThrow();
      });
    },
  );

  it('call names in strings, comments, regexes and template text do not become guarded calls', () => {
    const source = [
      "const text = 'setPassword() revokeEveryOtherSession()';",
      'const template = `listUserSessions() finishIntentRevocation()`;',
      String.raw`const expression = /setPassword\(\)/;`,
      '// accounts.listUserSessions();',
      '/* revokeEveryOtherSession(); */',
    ].join('\n');
    withGuardSource(source, (root, path) => {
      expect([...calledNames(path)]).toEqual([]);
      expect(() => assertIntentRevocations(root)).not.toThrow();
      expect(() => assertIncompleteSweeps(root)).not.toThrow();
    });
  });

  it('same-size and same-timestamp edits invalidate cached names before the real guard runs', () => {
    const revocation = 'revokeEveryMobileIntentToken()';
    const repaired = `listUserSessions(); ${revocation};`;
    withGuardSource(repaired, (root, path) => {
      expect(() => assertIntentRevocations(root)).not.toThrow();
      const original = statSync(path);
      writeFileSync(path, repaired.replace(revocation, ' '.repeat(revocation.length)));
      utimesSync(path, original.atime, original.mtime);
      expect(statSync(path).size).toBe(original.size);
      expect(calledNames(path).has('listUserSessions')).toBe(true);
      expect(calledNames(path).has('revokeEveryMobileIntentToken')).toBe(false);
      expect(() => assertIntentRevocations(root)).toThrow();
      writeFileSync(path, repaired);
      expect(() => assertIntentRevocations(root)).not.toThrow();
    });
  });

  it('each real guard discovers newly added callers and stops seeing deleted callers', () => {
    withGuardSource('const valid = true;', (root) => {
      expect(() => assertIntentRevocations(root)).not.toThrow();
      expect(() => assertIncompleteSweeps(root)).not.toThrow();
      const path = join(root, 'app', 'new-caller.ts');
      const ignoredPath = join(root, 'app', 'ignored-caller.ts');
      try {
        writeFileSync(path, 'listUserSessions();');
        writeFileSync(ignoredPath, 'revokeEveryOtherSession();');
        expect(calledNames(path).has('listUserSessions')).toBe(true);
        expect(calledNames(ignoredPath).has('revokeEveryOtherSession')).toBe(true);
        expect(() => assertIntentRevocations(root)).toThrow();
        expect(() => assertIncompleteSweeps(root)).toThrow();
        writeFileSync(path, 'listUserSessions(); revokeEveryMobileIntentToken();');
        writeFileSync(ignoredPath, 'revokeEveryOtherSession(); finishIntentRevocation();');
        expect(() => assertIntentRevocations(root)).not.toThrow();
        expect(() => assertIncompleteSweeps(root)).not.toThrow();
        rmSync(path);
        rmSync(ignoredPath);
        expect(() => assertIntentRevocations(root)).not.toThrow();
        expect(() => assertIncompleteSweeps(root)).not.toThrow();
      } finally {
        calledNamesCache.delete(path);
        calledNamesCache.delete(ignoredPath);
      }
    });
  });
});
