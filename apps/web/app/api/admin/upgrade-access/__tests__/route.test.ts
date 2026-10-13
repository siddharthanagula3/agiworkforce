import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type AuthGuardsModule = typeof import('@/lib/auth-guards');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type FlagStoreModule = typeof import('@/lib/feature-flags/flag-store');

type Row = Record<string, unknown>;

const OPERATOR_ID = 'user_platform_operator_1';
const FLAG_KEY = 'billing.upgrades_open';
const INVITE_ID = '00000000-0000-4000-8000-000000000101';

const state = vi.hoisted(() => ({
  definition: null as Record<string, unknown> | null,
  invites: [] as Record<string, unknown>[],
  auditEvents: [] as Record<string, unknown>[],
  securityEvents: [] as Record<string, unknown>[],
  statements: [] as { sql: string; params: unknown[] }[],
  requirePlatformAdmin: vi.fn(),
  requireCsrfToken: vi.fn(),
  uniqueViolationOnInsert: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: (...args: unknown[]) => state.requireCsrfToken(...args),
}));
vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<AuthGuardsModule>()),
  requirePlatformAdmin: (...args: unknown[]) => state.requirePlatformAdmin(...args),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
    state.auditEvents.push(event);
  }),
  logSecurityEvent: vi.fn(async (event: Record<string, unknown>) => {
    state.securityEvents.push(event);
  }),
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  getFlagDefinition: vi.fn(async () => state.definition),
  ensureFlagDefinition: vi.fn(async (input: Record<string, unknown>) => {
    state.definition ??= {
      ...input,
      version: 1,
      archivedAt: null,
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
    };
    return state.definition;
  }),
  updateFlagDefinition: vi.fn(async (input: Record<string, unknown>, expectedVersion: number) => {
    if (!state.definition || state.definition['version'] !== expectedVersion) return null;
    state.definition = { ...state.definition, ...input, version: expectedVersion + 1 };
    return state.definition;
  }),
}));

function inviteRow(invite: Row): Row {
  const metadata = (invite['metadata'] ?? {}) as Row;
  return { ...invite, note: metadata['note'] ?? null };
}

function answer(sql: string, params: unknown[]): Row[] {
  state.statements.push({ sql, params });
  if (sql.includes('public.security_audit_logs')) {
    const [last] = state.auditEvents
      .filter((event) => (event['detail'] as Row)['resourceId'] === params[0])
      .slice(-1);
    return last
      ? [
          {
            user_id: last['userId'],
            created_at: '2026-10-12T03:00:00.000Z',
            status: (last['detail'] as Row)['status'],
          },
        ]
      : [];
  }
  if (sql.includes('select exists(select 1 from public.beta_invites')) {
    const wanted = String(params[0]).toLowerCase();
    return [
      { taken: state.invites.some((invite) => String(invite['code']).toLowerCase() === wanted) },
    ];
  }
  if (sql.includes('insert into public.beta_invites')) {
    if (state.uniqueViolationOnInsert)
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    const [code, maxUses, expiresAt, createdBy, metadata] = params;
    const invite: Row = {
      id: INVITE_ID,
      code,
      max_uses: maxUses,
      current_uses: 0,
      expires_at: expiresAt,
      is_active: true,
      created_at: '2026-10-12T04:00:00.000Z',
      created_by: createdBy,
      metadata: JSON.parse(String(metadata)),
    };
    state.invites.push(invite);
    return [inviteRow(invite)];
  }
  if (sql.includes('update public.beta_invites')) {
    const invite = state.invites.find((row) => row['id'] === params[0] && row['is_active']);
    if (!invite) return [];
    invite['is_active'] = false;
    return [inviteRow(invite)];
  }
  if (sql.includes('from public.beta_invites')) {
    return state.invites.slice(0, Number(params[0])).map(inviteRow);
  }
  throw new Error(`Unexpected statement: ${sql}`);
}

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({
    query: async (sql: string, params: unknown[] = []) => answer(sql, params),
  }),
}));

import { createError } from '@/lib/errors';
import { GET as readState, POST as changeState } from '../route';
import { DELETE as disableCode, GET as listCodes, POST as createCode } from '../codes/route';

function request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): NextRequest {
  return new NextRequest(`https://app.test${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const STATE_PATH = '/api/admin/upgrade-access';
const CODES_PATH = '/api/admin/upgrade-access/codes';

beforeEach(() => {
  vi.clearAllMocks();
  state.definition = null;
  state.invites = [];
  state.auditEvents = [];
  state.securityEvents = [];
  state.statements = [];
  state.uniqueViolationOnInsert = false;
  state.requirePlatformAdmin.mockResolvedValue({ userId: OPERATOR_ID });
  state.requireCsrfToken.mockResolvedValue(null);
  vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('who may reach the upgrade access controls', () => {
  const calls = [
    { name: 'read the switch', call: () => readState(request(STATE_PATH, 'GET')) },
    {
      name: 'flip the switch',
      call: () => changeState(request(STATE_PATH, 'POST', { open: true })),
    },
    { name: 'list codes', call: () => listCodes(request(CODES_PATH, 'GET')) },
    {
      name: 'create a code',
      call: () => createCode(request(CODES_PATH, 'POST', { maxRedemptions: 5 })),
    },
    {
      name: 'disable a code',
      call: () => disableCode(request(CODES_PATH, 'DELETE', { id: INVITE_ID })),
    },
  ];

  it.each(calls)('answers 404 to a caller who is not a platform operator: $name', async (entry) => {
    state.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await entry.call();

    expect(response.status).toBe(404);
    expect(state.definition).toBeNull();
    expect(state.invites).toEqual([]);
    expect(state.statements).toEqual([]);
  });

  it('refuses a write that carries no CSRF token before anything is changed', async () => {
    state.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await changeState(request(STATE_PATH, 'POST', { open: true }));

    expect(response.status).toBe(403);
    expect(state.definition).toBeNull();
    expect(state.requirePlatformAdmin).not.toHaveBeenCalled();
  });
});

describe('the paid upgrade switch', () => {
  it('reports closed with no history before anybody has flipped it', async () => {
    const response = await readState(request(STATE_PATH, 'GET'));

    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      open: false,
      switchOpen: false,
      forcedOpenByEnvironment: false,
      targetingRules: 0,
      lastChange: null,
    });
  });

  it('opens upgrades, writes the audit entry and names who did it', async () => {
    const response = await changeState(request(STATE_PATH, 'POST', { open: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      open: true,
      switchOpen: true,
      forcedOpenByEnvironment: false,
      targetingRules: 0,
      lastChange: {
        opened: true,
        changedAt: '2026-10-12T03:00:00.000Z',
        changedBy: OPERATOR_ID,
      },
    });
    expect(state.definition).toMatchObject({ key: FLAG_KEY, defaultVariant: 'on', version: 2 });
    expect(state.auditEvents).toEqual([
      expect.objectContaining({
        userId: OPERATOR_ID,
        eventType: 'feature_flag_changed',
        severity: 'warning',
        detail: expect.objectContaining({
          resourceId: FLAG_KEY,
          status: 'upgrades_opened',
          enabled: true,
          changedKeys: ['defaultVariant'],
        }),
      }),
    ]);
  });

  it('closes them again and records that as its own entry', async () => {
    await changeState(request(STATE_PATH, 'POST', { open: true }));
    const response = await changeState(request(STATE_PATH, 'POST', { open: false }));

    await expect(response.json()).resolves.toMatchObject({
      open: false,
      switchOpen: false,
      lastChange: { opened: false, changedBy: OPERATOR_ID },
    });
    expect(state.definition).toMatchObject({ defaultVariant: 'off', version: 3 });
    expect(state.auditEvents.map((event) => (event['detail'] as Row)['status'])).toEqual([
      'upgrades_opened',
      'upgrades_closed',
    ]);
  });

  it('writes nothing when asked for the state the switch is already in', async () => {
    await changeState(request(STATE_PATH, 'POST', { open: false }));

    expect(state.definition).toMatchObject({ defaultVariant: 'off', version: 1 });
    expect(state.auditEvents).toEqual([]);
  });

  it('releases an engaged kill switch when opening, so open means open', async () => {
    await changeState(request(STATE_PATH, 'POST', { open: true }));
    state.definition = { ...state.definition, killSwitch: true };

    const closed = await readState(request(STATE_PATH, 'GET'));
    await expect(closed.json()).resolves.toMatchObject({ open: false, switchOpen: false });

    const reopened = await changeState(request(STATE_PATH, 'POST', { open: true }));
    await expect(reopened.json()).resolves.toMatchObject({ open: true, switchOpen: true });
    expect(state.definition).toMatchObject({ killSwitch: false, defaultVariant: 'on' });
  });

  it('says when the environment is holding upgrades open over a closed switch', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');

    const response = await readState(request(STATE_PATH, 'GET'));

    await expect(response.json()).resolves.toMatchObject({
      open: true,
      switchOpen: false,
      forcedOpenByEnvironment: true,
    });
  });

  it('rejects a body that does not say open or closed', async () => {
    const response = await changeState(request(STATE_PATH, 'POST', { open: 'yes' }));

    expect(response.status).toBe(400);
    expect(state.definition).toBeNull();
  });
});

describe('access codes', () => {
  it('creates the code the operator typed, upper-cased, as an access-only invite', async () => {
    const response = await createCode(
      request(CODES_PATH, 'POST', {
        code: 'founders2026',
        maxRedemptions: 25,
        expiresAt: '2099-01-01T00:00:00.000Z',
        note: 'First design partners',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      code: {
        id: INVITE_ID,
        code: 'FOUNDERS2026',
        maxRedemptions: 25,
        redemptions: 0,
        expiresAt: '2099-01-01T00:00:00.000Z',
        active: true,
        note: 'First design partners',
        createdAt: '2026-10-12T04:00:00.000Z',
        createdBy: OPERATOR_ID,
      },
    });
    expect(state.invites[0]?.['metadata']).toEqual({
      kind: 'billing_upgrade_access',
      note: 'First design partners',
    });
    const insert = state.statements.find((entry) => entry.sql.includes('insert into'));
    expect(insert?.sql).toContain("'free', 0");
  });

  it('generates an unambiguous code when none is given', async () => {
    const response = await createCode(request(CODES_PATH, 'POST', { maxRedemptions: 1 }));
    const body = (await response.json()) as { code: { code: string } };

    expect(body.code.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
  });

  it('records who created a code without writing the code into the audit log', async () => {
    await createCode(request(CODES_PATH, 'POST', { code: 'SECRETCODE1', maxRedemptions: 3 }));

    expect(state.securityEvents).toEqual([
      expect.objectContaining({
        userId: OPERATOR_ID,
        eventType: 'admin_action',
        endpoint: CODES_PATH,
        details: {
          action: 'upgrade_access_code_created',
          inviteId: INVITE_ID,
          maxRedemptions: 3,
          expiresAt: null,
        },
      }),
    ]);
    expect(JSON.stringify(state.securityEvents)).not.toContain('SECRETCODE1');
  });

  it.each([
    { name: 'no redemption limit', body: {} },
    { name: 'a limit of zero', body: { maxRedemptions: 0 } },
    { name: 'a limit above the ceiling', body: { maxRedemptions: 100_001 } },
    { name: 'a fractional limit', body: { maxRedemptions: 1.5 } },
    { name: 'a code with punctuation', body: { code: 'FOUNDERS-2026', maxRedemptions: 1 } },
    { name: 'a code that is too short', body: { code: 'ABC', maxRedemptions: 1 } },
    { name: 'a code that is too long', body: { code: 'A'.repeat(51), maxRedemptions: 1 } },
    { name: 'an expiry that is not a timestamp', body: { maxRedemptions: 1, expiresAt: 'soon' } },
    { name: 'a note that is too long', body: { maxRedemptions: 1, note: 'n'.repeat(201) } },
    { name: 'a field it does not know', body: { maxRedemptions: 1, planTier: 'max' } },
  ])('refuses $name', async ({ body }) => {
    const response = await createCode(request(CODES_PATH, 'POST', body));

    expect(response.status).toBe(400);
    expect(state.invites).toEqual([]);
    expect(state.securityEvents).toEqual([]);
  });

  it('refuses an expiry that has already passed', async () => {
    const response = await createCode(
      request(CODES_PATH, 'POST', { maxRedemptions: 1, expiresAt: '2020-01-01T00:00:00.000Z' }),
    );

    expect(response.status).toBe(400);
    expect(state.invites).toEqual([]);
  });

  it('refuses a code that already exists, whatever its letter case', async () => {
    await createCode(request(CODES_PATH, 'POST', { code: 'FOUNDERS2026', maxRedemptions: 1 }));

    const response = await createCode(
      request(CODES_PATH, 'POST', { code: 'founders2026', maxRedemptions: 1 }),
    );

    expect(response.status).toBe(409);
    expect(state.invites).toHaveLength(1);
  });

  it('answers a concurrent duplicate with the same refusal rather than a failure', async () => {
    state.uniqueViolationOnInsert = true;

    const response = await createCode(
      request(CODES_PATH, 'POST', { code: 'RACECODE1', maxRedemptions: 1 }),
    );

    expect(response.status).toBe(409);
    expect(state.securityEvents).toEqual([]);
  });

  it('lists codes with how many times each was redeemed', async () => {
    state.invites = [
      {
        id: INVITE_ID,
        code: 'FOUNDERS2026',
        max_uses: 25,
        current_uses: 7,
        expires_at: null,
        is_active: true,
        created_at: '2026-10-12T04:00:00.000Z',
        created_by: OPERATOR_ID,
        metadata: { kind: 'billing_upgrade_access' },
      },
    ];

    const response = await listCodes(request(CODES_PATH, 'GET'));

    await expect(response.json()).resolves.toEqual({
      truncated: false,
      codes: [
        expect.objectContaining({
          code: 'FOUNDERS2026',
          maxRedemptions: 25,
          redemptions: 7,
          active: true,
          note: null,
        }),
      ],
    });
  });

  it('disables a code once, records it, and answers 404 the second time', async () => {
    await createCode(request(CODES_PATH, 'POST', { code: 'FOUNDERS2026', maxRedemptions: 1 }));
    state.securityEvents = [];

    const first = await disableCode(request(CODES_PATH, 'DELETE', { id: INVITE_ID }));
    const second = await disableCode(request(CODES_PATH, 'DELETE', { id: INVITE_ID }));

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ code: { active: false } });
    expect(second.status).toBe(404);
    expect(state.securityEvents).toEqual([
      expect.objectContaining({
        details: { action: 'upgrade_access_code_disabled', inviteId: INVITE_ID, redemptions: 0 },
      }),
    ]);
  });

  it('refuses to disable anything but a code id', async () => {
    const response = await disableCode(request(CODES_PATH, 'DELETE', { id: 'FOUNDERS2026' }));

    expect(response.status).toBe(400);
  });
});
