import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeResponseSchema } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const { mockGetClerkAuthUser, mockNeonQuery, mockGetSubscription, flagMocks } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockGetSubscription: vi.fn(),
  flagMocks: {
    getActiveFlagDefinitions: vi.fn(),
    getSubjectOverrides: vi.fn(),
    resolveOrgMembership: vi.fn(),
  },
}));

vi.mock('@/lib/feature-flags/flag-store', () => ({
  getActiveFlagDefinitions: (...args: unknown[]) => flagMocks.getActiveFlagDefinitions(...args),
  getSubjectOverrides: (...args: unknown[]) => flagMocks.getSubjectOverrides(...args),
}));

vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveOrgMembership: (...args: unknown[]) => flagMocks.resolveOrgMembership(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/web-search/web-search-tool', () => ({
  webSearchBackendConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: vi.fn().mockResolvedValue({
        fullName: 'Contract Tester',
        firstName: 'Contract',
        lastName: 'Tester',
        username: 'contract',
        primaryEmailAddress: { emailAddress: 'contract@example.com' },
      }),
    },
  }),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

import { GET } from '../route';

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

function flag(key: string, rules: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    key,
    description: '',
    killSwitch: false,
    variants: ['on', 'off', 'treatment'],
    defaultVariant: 'off',
    rules,
    expiresAt: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function killSwitch(key: string, description: string, rules: unknown[]) {
  return flag(key, rules, {
    description,
    variants: ['on', 'off'],
    defaultVariant: 'on',
  });
}

function versionRule(id: string, range: Record<string, string>) {
  return { id, conditions: { clientVersion: range }, bucketBy: 'user', variant: 'off' };
}

function makeGetRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/me?surface=desktop', {
    method: 'GET',
    headers,
  }) as never;
}

describe('GET /api/me, evaluated rollout flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_flags_1', email: 'f@example.com' });
    mockNeonQuery.mockResolvedValue([]);
    mockGetSubscription.mockResolvedValue({ plan_tier: 'max', status: 'active' });
    flagMocks.resolveOrgMembership.mockResolvedValue({
      organizationId: WORKSPACE_ID,
      role: 'admin',
    });
    flagMocks.getSubjectOverrides.mockResolvedValue([]);
  });

  it('adds evaluated flags beside the existing keys without changing their shape', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      flag('composer.voice', [
        {
          id: 'targeted',
          conditions: {
            workspaceIds: [WORKSPACE_ID],
            roles: ['admin'],
            plans: ['max'],
            surfaces: ['desktop'],
            countries: ['DE'],
            regions: ['us'],
            clientVersion: { min: '3.1' },
          },
          bucketBy: 'user',
          variant: 'treatment',
        },
      ]),
      flag('composer.other', []),
      flag('routing.canary', [{ id: 'all', conditions: {}, bucketBy: 'user', variant: 'on' }]),
    ]);

    const response = await GET(
      makeGetRequest({ 'x-vercel-ip-country': 'de', 'x-agi-client-version': '3.2.0' }),
    );
    const parsed = MeResponseSchema.safeParse(await response.json());
    expect(parsed.error).toBeUndefined();
    if (!parsed.success) return;
    expect(parsed.data.feature_flags).toMatchObject({
      advanced_model_access: true,
      'composer.voice': true,
      'composer.other': false,
    });
    expect(parsed.data.feature_flags).not.toHaveProperty('routing.canary');
    expect(parsed.data.feature_flag_variants).toEqual({
      'composer.voice': 'treatment',
      'composer.other': 'off',
    });
  });

  it('does not let a flag named like a computed key override the computed value', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      flag('code_execution', [{ id: 'all', conditions: {}, bucketBy: 'user', variant: 'on' }]),
    ]);
    mockGetSubscription.mockResolvedValue(null);
    const response = await GET(makeGetRequest());
    const body = await response.json();
    expect(body.feature_flags.advanced_model_access).toBe(false);
    expect(typeof body.feature_flags.code_execution).toBe('boolean');
  });

  function ringFlag(key: string, surface: string) {
    return flag(key, [
      {
        id: 'ring',
        conditions: { surfaces: [surface] },
        rollout: { percentage: 100 },
        bucketBy: 'user',
        variant: 'on',
      },
    ]);
  }

  it('offers a staged ring only to its own surface and channel', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      ringFlag('rollout.desktop.beta.new_composer', 'desktop'),
      ringFlag('rollout.mobile.beta.new_composer', 'mobile'),
    ]);

    const response = await GET(
      new Request('http://localhost:3000/api/me?surface=desktop&channel=beta') as never,
    );
    const body = await response.json();

    expect(body.feature_flags['rollout.desktop.beta.new_composer']).toBe(true);
    expect(body.feature_flags).not.toHaveProperty('rollout.mobile.beta.new_composer');
  });

  it('hands a client on an unnamed channel none of the staged rings', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      ringFlag('rollout.desktop.beta.new_composer', 'desktop'),
    ]);

    const body = await (await GET(makeGetRequest())).json();

    expect(body.feature_flags).not.toHaveProperty('rollout.desktop.beta.new_composer');
  });

  it('serves the existing keys when the flag store has nothing to evaluate', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([]);
    flagMocks.resolveOrgMembership.mockRejectedValue(new Error('membership read failed'));
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.feature_flags).sort()).toEqual(
      ['advanced_model_access', 'code_execution', 'generic_web_search'].sort(),
    );
    expect(body.feature_flag_variants).toEqual({});
  });
});

describe('GET /api/me, capabilities held closed', () => {
  const REASON = 'Voice stops responding on this build and a fix is on its way.';
  const EXPLAINED = `${REASON} (incident INC-42)`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_closed_1', email: 'c@example.com' });
    mockNeonQuery.mockResolvedValue([]);
    mockGetSubscription.mockResolvedValue({ plan_tier: 'max', status: 'active' });
    flagMocks.resolveOrgMembership.mockResolvedValue({
      organizationId: WORKSPACE_ID,
      role: 'admin',
    });
    flagMocks.getSubjectOverrides.mockResolvedValue([]);
  });

  it('carries the sentence the operator left, to the builds the range names', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      killSwitch('capability.can_use_voice', EXPLAINED, [
        versionRule('disabled-inc-42', { max: '3.2' }),
      ]),
    ]);

    const parsed = MeResponseSchema.safeParse(
      await (await GET(makeGetRequest({ 'x-agi-client-version': '3.1.0' }))).json(),
    );
    expect(parsed.error).toBeUndefined();
    if (!parsed.success) return;

    expect(parsed.data.disabled_features).toEqual([
      { capability: 'canUseVoice', reason: EXPLAINED },
    ]);
  });

  it('leaves a build outside the range untouched', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      killSwitch('capability.can_use_voice', EXPLAINED, [
        versionRule('disabled-inc-42', { max: '3.2' }),
      ]),
    ]);

    const body = await (await GET(makeGetRequest({ 'x-agi-client-version': '3.3.0' }))).json();

    expect(body.disabled_features).toEqual([]);
  });

  /**
   * Builds that shipped before the version header existed are still in the
   * field. Placing one at the newest release would close it out of every range
   * an operator writes for a broken build; refusing it would make one
   * deployment answer one binary.
   */
  it('holds nothing closed for a build that names no version', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      killSwitch('capability.can_use_voice', EXPLAINED, [
        versionRule('disabled-inc-42', { max: '3.2' }),
      ]),
    ]);

    const response = await GET(makeGetRequest());
    const parsed = MeResponseSchema.safeParse(await response.json());

    expect(response.status).toBe(200);
    expect(parsed.error).toBeUndefined();
    if (!parsed.success) return;
    expect(parsed.data.disabled_features).toEqual([]);
    expect(parsed.data.capability_handshake).toBeDefined();
  });

  it('answers two live builds from one deployment, each on its own terms', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      killSwitch('capability.can_use_voice', EXPLAINED, [
        versionRule('disabled-inc-42', { min: '3.0', max: '3.2' }),
      ]),
    ]);

    const [held, served] = await Promise.all(
      ['3.1.0', '3.3.0'].map(async (version) =>
        (await GET(makeGetRequest({ 'x-agi-client-version': version }))).json(),
      ),
    );

    expect(held.disabled_features).toEqual([{ capability: 'canUseVoice', reason: EXPLAINED }]);
    expect(served.disabled_features).toEqual([]);
    expect(held.capability_handshake).toBeDefined();
    expect(served.capability_handshake).toBeDefined();
  });

  it('invents no explanation for a switch that carries none', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([
      killSwitch('capability.can_use_voice', 'Open unless voice is switched off.', [
        versionRule('all-builds', { max: '9.9' }),
      ]),
    ]);

    const body = await (await GET(makeGetRequest({ 'x-agi-client-version': '3.1.0' }))).json();

    expect(body.disabled_features).toEqual([{ capability: 'canUseVoice', reason: null }]);
  });

  it('carries an empty list when the flag store has nothing to evaluate', async () => {
    flagMocks.getActiveFlagDefinitions.mockResolvedValue([]);

    const body = await (await GET(makeGetRequest())).json();

    expect(body.disabled_features).toEqual([]);
  });
});
