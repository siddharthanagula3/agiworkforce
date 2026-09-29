import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRevokeEvery, mockRevokeTokens, mockAudit } = vi.hoisted(() => ({
  mockRevokeEvery: vi.fn(),
  mockRevokeTokens: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockAudit }));
vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/mobile-intent-tokens')>()),
  revokeEveryMobileIntentToken: (...args: unknown[]) => mockRevokeEvery(...args),
  revokeMobileIntentTokens: (...args: unknown[]) => mockRevokeTokens(...args),
}));

import { revokeEveryOtherSession } from '../session-revocation';
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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function calledNames(path: string): Set<string> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee)) names.add(callee.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
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
    const missing = [...sourceFiles(join(WEB_ROOT, 'lib')), ...sourceFiles(join(WEB_ROOT, 'app'))]
      .map((path) => ({ path: relative(WEB_ROOT, path), calls: calledNames(path) }))
      .filter(({ path }) => !SINGLE_SESSION_MODULES.has(path) && !CHOKEPOINT_MODULES.has(path))
      .filter(({ calls }) => [...SWEEP_CALLS].some((name) => calls.has(name)))
      .filter(({ calls }) => ![...INTENT_REVOKING_CALLS].some((name) => calls.has(name)))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });
});
