import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  CHAT_LARGE_FILE_POLICY,
  CLIENT_CAPABILITIES_REQUEST_HEADER,
  LARGE_CHAT_FILES_CAPABILITY,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  MeResponseSchema,
} from '@agiworkforce/cloud-contracts';
import {
  getBillingPlanPricing,
  getBillingPlanProductLimits,
  getPlanMaxChatFileBytes,
} from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => true,
}));

const { mockGetClerkAuthUser, mockNeonQuery, mockGetSubscription, activeWorkspaceReads } =
  vi.hoisted(() => ({
    mockGetClerkAuthUser: vi.fn(),
    mockNeonQuery: vi.fn(),
    mockGetSubscription: vi.fn(),
    activeWorkspaceReads: vi.fn(),
  }));

type ActiveWorkspaceModule = typeof import('@/lib/services/active-workspace-service');

vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => {
  const actual = await importOriginal<ActiveWorkspaceModule>();
  return {
    ...actual,
    resolveActiveOrganizationId: (
      ...args: Parameters<ActiveWorkspaceModule['resolveActiveOrganizationId']>
    ) => {
      activeWorkspaceReads(...args);
      return actual.resolveActiveOrganizationId(...args);
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
  getClientIpForRateLimit: vi.fn(() => '203.0.113.7'),
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

vi.mock('@/lib/server/neon-db', () => {
  const db = {
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: async () => 0,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { getNeonDb: vi.fn(() => db) };
});

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

import { getNeonDb } from '@/lib/server/neon-db';
import { GET } from '../route';

type TypesModule = typeof import('@agiworkforce/types');

const SEAT_PERIOD_END = '2026-10-05T00:00:00.000Z';

function seatCandidate(over: Record<string, unknown> = {}) {
  return {
    organization_id: '33333333-3333-4333-8333-333333333333',
    owner_user_id: 'user_org_owner',
    billing_plan_tier: 'team',
    licensed_seats: 5,
    seat_rank: 2,
    subscription_id: 'subscription_org_owner',
    status: 'active',
    current_period_start: '2026-09-05T00:00:00.000Z',
    current_period_end: SEAT_PERIOD_END,
    cancel_at_period_end: false,
    stripe_subscription_id: 'sub_org_owner',
    stripe_price_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
    plan_catalog_version: null,
    ...over,
  };
}

function makeGetRequest(query?: string) {
  const url = query ? `http://localhost:3000/api/me?${query}` : 'http://localhost:3000/api/me';
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/me, shared cloud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({
      userId: 'user_contract_1',
      email: 'contract@example.com',
    });
    mockNeonQuery.mockResolvedValue([{ routing_preferences: { us_only: false } }]);
  });

  it('response for a subscribed user parses against MeResponseSchema', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
      stripe_subscription_id: 'sub_contract1',
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).not.toHaveProperty('credits');
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plan.tier).toBe('pro');
      expect(parsed.data.plan.current_period_end).toBeTypeOf('number');
      expect(parsed.data.plan.cancel_at_period_end).toBe(false);
      expect(parsed.data.plan.subscription_source).toBe('stripe');
      expect(parsed.data.feature_flags.advanced_model_access).toBe(true);
      expect(parsed.data.feature_flags.generic_web_search).toBe(true);
      expect(parsed.data.capability_handshake?.granted).toContain('canUseWebSearch');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseVoice');
      expect(parsed.data.capability_handshake?.sources.tier).toBe('tier:pro');
    }
  });

  it('response for a free user (no subscription, no credits) still parses', async () => {
    mockGetSubscription.mockResolvedValue(null);
    mockNeonQuery.mockResolvedValue([]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plan).toEqual({
        tier: 'free',
        display_name: 'Free',
        status: 'none',
        current_period_end: null,
        cancel_at_period_end: false,
        effective_tier: 'free',
        subscription_source: 'none',
        billing_owner: 'personal',
      });
      expect(parsed.data.routing_preferences).toEqual({});
      expect(parsed.data.capability_handshake?.granted).toContain('canUseWebSearch');
      expect(parsed.data.capability_handshake?.granted).not.toContain('canUseDeepResearch');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseVoice');
      expect(parsed.data.capability_handshake?.granted).not.toContain('canUseConnectors');
      expect(parsed.data.capability_handshake?.deniedBy['canUseDeepResearch']).toEqual(['tier']);
      expect(parsed.data.capability_handshake?.granted).toContain('canChat');
    }
  });

  it('hands the phone the chat attachment limits from the shared policy', async () => {
    mockGetSubscription.mockResolvedValue(null);
    mockNeonQuery.mockResolvedValue([]);

    const res = await GET(makeGetRequest('surface=mobile'));
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.attachment_limits).toEqual({
      max_file_bytes: MAX_CHAT_ATTACHMENT_BYTES,
      max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
      max_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
      max_files_per_message: MAX_CHAT_ATTACHMENT_COUNT,
    });
  });

  it.each([
    ['apple', { apple_original_transaction_id: 'original-apple-1' }],
    ['google', { google_purchase_token: 'google-token-1' }],
    ['manual', {}],
  ] as const)('reports %s as the subscription management source', async (source, ownership) => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
      ...ownership,
    });

    const res = await GET(makeGetRequest('surface=mobile'));
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.plan.subscription_source).toBe(source);
  });

  it('reports a plan granted by hand to a personal account as personally owned, not organization-managed', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'max',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
    });

    const res = await GET(makeGetRequest());
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.plan.subscription_source).toBe('manual');
    expect(parsed.plan.billing_owner).toBe('personal');
  });

  it.each(['team', 'enterprise'] as const)(
    'reports the %s plan held without a seat as organization-owned',
    async (planTier) => {
      mockGetSubscription.mockResolvedValue({
        plan_tier: planTier,
        status: 'active',
        current_period_end: '2026-08-05T00:00:00.000Z',
      });

      const res = await GET(makeGetRequest());
      const parsed = MeResponseSchema.parse(await res.json());

      expect(parsed.plan.subscription_source).toBe('manual');
      expect(parsed.plan.billing_owner).toBe('organization');
    },
  );

  it('omits the owner when provider identifiers contradict each other', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
      stripe_subscription_id: 'sub_contract1',
      apple_original_transaction_id: 'original-apple-1',
    });

    const res = await GET(makeGetRequest());
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.plan.subscription_source).toBeUndefined();
  });

  it('names the plan by its catalog label, so max_15x reads by its registry label', async () => {
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'max_15x',
      status: 'active',
      current_period_end: '2026-10-05T00:00:00.000Z',
      stripe_subscription_id: 'sub_contract1',
    });

    const res = await GET(makeGetRequest());
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.plan.tier).toBe('max_15x');
    expect(parsed.plan.display_name).toBe(getBillingPlanPricing('max_15x').label);
  });

  it.each([
    ['team', 'Team', 'tier:pro'],
    ['enterprise', 'Enterprise', 'tier:enterprise'],
  ] as const)(
    'gives a %s seat member with no subscription of their own the organization plan, managed by the organization',
    async (orgTier, label, tierPolicy) => {
      mockGetSubscription.mockResolvedValue(null);
      mockNeonQuery.mockImplementation(async (sql: string) =>
        sql.includes('from public.organization_members membership')
          ? [seatCandidate({ billing_plan_tier: orgTier })]
          : [{ routing_preferences: { us_only: false } }],
      );

      const res = await GET(makeGetRequest());
      expect(res.status).toBe(200);
      const parsed = MeResponseSchema.parse(await res.json());

      expect(parsed.plan).toEqual({
        tier: orgTier,
        display_name: label,
        status: 'active',
        current_period_end: Date.parse(SEAT_PERIOD_END) / 1000,
        cancel_at_period_end: false,
        effective_tier: orgTier,
        ...(orgTier === 'team' ? { seat_type: 'standard' } : {}),
        subscription_source: 'manual',
        billing_owner: 'organization',
      });
      expect(parsed.capability_handshake?.sources.tier).toBe(tierPolicy);
      expect(parsed.feature_flags.advanced_model_access).toBe(true);
    },
  );

  it('reports a Premium seat member as Team with a Premium seat, never as a tier older clients cannot read', async () => {
    mockGetSubscription.mockResolvedValue(null);
    mockNeonQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.organization_members membership')
        ? [
            seatCandidate({
              seat_type: 'premium',
              licensed_premium_seats: 1,
              premium_seat_rank: 1,
              premium_paid_through: null,
            }),
          ]
        : [{ routing_preferences: { us_only: false } }],
    );

    const res = await GET(makeGetRequest());
    const body = await res.json();
    const parsed = MeResponseSchema.parse(body);

    expect(parsed.plan).toMatchObject({
      tier: 'team',
      display_name: 'Team',
      effective_tier: 'team',
      seat_type: 'premium',
    });
    expect(JSON.stringify(body)).not.toContain('team_premium');
    expect(parsed.capability_handshake?.sources.tier).toBe('tier:max');
  });

  it('keeps a seat member on Free when the organization has used every licensed seat', async () => {
    mockGetSubscription.mockResolvedValue(null);
    mockNeonQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.organization_members membership')
        ? [seatCandidate({ licensed_seats: 2, seat_rank: 3 })]
        : [],
    );

    const res = await GET(makeGetRequest());
    const parsed = MeResponseSchema.parse(await res.json());

    expect(parsed.plan).toMatchObject({ tier: 'free', display_name: 'Free', status: 'none' });
    expect(parsed.capability_handshake?.sources.tier).toBe('tier:free');
  });

  it('fails closed when subscription entitlement cannot be verified', async () => {
    mockGetSubscription.mockRejectedValue(new Error('subscription backend down'));
    mockNeonQuery.mockRejectedValue(new Error('db down'));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(MeResponseSchema.safeParse(body).success).toBe(false);
    expect(body).not.toHaveProperty('plan');
  });
});

describe('GET /api/me, capability_handshake surface parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({
      userId: 'user_contract_1',
      email: 'contract@example.com',
    });
    mockNeonQuery.mockResolvedValue([{ routing_preferences: { us_only: false } }]);
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'max',
      status: 'active',
      current_period_end: '2026-08-05T00:00:00.000Z',
    });
  });

  it('defaults to the web surface when no ?surface= is given (no behavior change for existing callers)', async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:web');
      expect(parsed.data.capability_handshake?.granted).not.toContain('canUseFileSystem');
    }
  });

  it('honors an explicit ?surface=desktop and grants desktop-only capabilities', async () => {
    const res = await GET(makeGetRequest('surface=desktop'));
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:desktop');
      expect(parsed.data.capability_handshake?.granted).toContain('canUseFileSystem');
    }
  });

  it('falls back to web for an invalid/unrecognized surface value rather than throwing', async () => {
    const res = await GET(makeGetRequest('surface=not_a_real_surface'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = MeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.capability_handshake?.sources.surface).toBe('surface:web');
    }
  });
});

describe('GET /api/me, large chat file limits', () => {
  const SCANNER_URL = 'https://scanner.test/scan';
  const SCANNER_MAX_BYTES = 520 * 1024 * 1024;
  const TODAY = {
    max_file_bytes: MAX_CHAT_ATTACHMENT_BYTES,
    max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
    max_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
    max_files_per_message: MAX_CHAT_ATTACHMENT_COUNT,
  };
  const PRO_STORAGE_BYTES = getBillingPlanProductLimits('pro')!.knowledgeStorageBytes as number;
  const STORED_BYTES = 2 * 1024 ** 3;
  let systemTimeMs = Date.parse('2026-11-15T12:00:00Z');
  let schemaReady = true;
  let scannerProtocol = 2;
  const realFetch = globalThis.fetch;
  const scannerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('/v2/capability')) return realFetch(input, init);
    return new Response(
      JSON.stringify({
        protocol: scannerProtocol,
        maxSourceScanBytes: SCANNER_MAX_BYTES,
        queueDepth: 0,
        running: 0,
      }),
      { status: 200 },
    );
  });

  async function workspaceReadsFor(request: NextRequest): Promise<number> {
    activeWorkspaceReads.mockClear();
    await limitsFor(request);
    return activeWorkspaceReads.mock.calls.filter(([db]) => db === getNeonDb()).length;
  }

  async function workspaceReadsWithoutTheFlag(request: NextRequest): Promise<number> {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
    const reads = await workspaceReadsFor(request);
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    return reads;
  }

  function chatFileQueries(): string[] {
    return mockNeonQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => /chat_file_|scanned_sha256/.test(sql));
  }

  function requestWith(headers: Record<string, string>) {
    return new NextRequest('http://localhost:3000/api/me?surface=mobile', {
      method: 'GET',
      headers,
    });
  }

  const LARGE_FILES_HEADER = { [CLIENT_CAPABILITIES_REQUEST_HEADER]: LARGE_CHAT_FILES_CAPABILITY };

  beforeEach(() => {
    vi.clearAllMocks();
    systemTimeMs += 60 * 60_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(systemTimeMs);
    vi.stubGlobal('fetch', scannerFetch);
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', SCANNER_URL);
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_TOKEN', 'scanner-test-token');
    schemaReady = true;
    scannerProtocol = 2;
    mockGetClerkAuthUser.mockResolvedValue({
      userId: 'user_contract_1',
      email: 'contract@example.com',
    });
    mockGetSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: '2026-12-05T00:00:00.000Z',
      stripe_subscription_id: 'sub_contract1',
    });
    mockNeonQuery.mockImplementation(async (sql: string) => {
      if (/to_regclass/.test(sql)) {
        return [
          {
            intakes_table: schemaReady,
            preparations_table: schemaReady,
            scanned_sha256_column: schemaReady,
          },
        ];
      }
      if (/as in_flight/.test(sql)) return [{ in_flight: 0 }];
      if (/as declared/.test(sql)) return [{ declared: '0' }];
      if (/sum\(m\.byte_size\)/.test(sql)) return [{ total: String(STORED_BYTES) }];
      return [{ routing_preferences: { us_only: false } }];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function limitsFor(request: NextRequest) {
    const res = await GET(request);
    expect(res.status).toBe(200);
    return MeResponseSchema.parse(await res.json()).attachment_limits;
  }

  it('hands a build without the token today’s limits byte for byte and asks nothing more', async () => {
    expect(await limitsFor(requestWith({}))).toStrictEqual(TODAY);
    expect(chatFileQueries()).toEqual([]);
    expect(scannerFetch).not.toHaveBeenCalled();
  });

  it('hands the token today’s limits with the flag off, without a query or a fetch', async () => {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
    expect(await limitsFor(requestWith(LARGE_FILES_HEADER))).toStrictEqual(TODAY);
    expect(chatFileQueries()).toEqual([]);
    expect(scannerFetch).not.toHaveBeenCalled();
  });

  it('hands the token today’s limits while the scanner speaks protocol 1', async () => {
    scannerProtocol = 1;
    expect(await limitsFor(requestWith(LARGE_FILES_HEADER))).toStrictEqual(TODAY);
    expect(scannerFetch).toHaveBeenCalledTimes(1);
  });

  it('hands the token today’s limits on a database without the intake tables, sending only the probe', async () => {
    schemaReady = false;
    expect(await limitsFor(requestWith(LARGE_FILES_HEADER))).toStrictEqual(TODAY);
    expect(chatFileQueries().every((sql) => /to_regclass/.test(sql))).toBe(true);
    expect(scannerFetch).not.toHaveBeenCalled();
  });

  it('hands Free today’s limits even with the token', async () => {
    mockGetSubscription.mockResolvedValue(null);
    expect(await limitsFor(requestWith(LARGE_FILES_HEADER))).toStrictEqual(TODAY);
    expect(chatFileQueries()).toEqual([]);
  });

  it('reads no extra workspace for a plan that can never be offered large files', async () => {
    mockGetSubscription.mockResolvedValue(null);
    const baseline = await workspaceReadsWithoutTheFlag(requestWith(LARGE_FILES_HEADER));
    expect(await workspaceReadsFor(requestWith(LARGE_FILES_HEADER))).toBe(baseline);
  });

  it('reads the workspace once more when a paid plan with the token passes the request checks', async () => {
    const baseline = await workspaceReadsWithoutTheFlag(requestWith(LARGE_FILES_HEADER));
    expect(await workspaceReadsFor(requestWith(LARGE_FILES_HEADER))).toBe(baseline + 1);
  });

  it.each([`${LARGE_CHAT_FILES_CAPABILITY}0`, 'large-chat-files', ''])(
    'reads %j as no token',
    async (value) => {
      const limits = await limitsFor(requestWith({ [CLIENT_CAPABILITIES_REQUEST_HEADER]: value }));
      expect(limits).toStrictEqual(TODAY);
    },
  );

  it('hands the token the large limits, the storage left and the inline message limit once everything is ready', async () => {
    const limits = await limitsFor(
      requestWith({
        [CLIENT_CAPABILITIES_REQUEST_HEADER]: `other-capability, ${LARGE_CHAT_FILES_CAPABILITY}`,
      }),
    );

    expect(limits).toMatchObject({
      max_file_bytes: Math.min(
        CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
        getPlanMaxChatFileBytes('pro'),
        SCANNER_MAX_BYTES,
      ),
      max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
      large_files_available: true,
      storage_remaining_bytes: PRO_STORAGE_BYTES - STORED_BYTES,
      inline_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
    });
    expect(limits?.max_message_bytes).toBeGreaterThan(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES);
  });

  describe('from a browser page on a preview host', () => {
    const PREVIEW_ORIGIN = 'https://preview-chat-files.example.app';

    function previewPageRequest() {
      return new NextRequest(`${PREVIEW_ORIGIN}/api/me`, {
        method: 'GET',
        headers: { ...LARGE_FILES_HEADER, 'sec-fetch-site': 'same-origin' },
      });
    }

    beforeEach(() => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', '');
    });

    it('hands a same-origin page storage does not list today’s limits, without a fetch', async () => {
      expect(await limitsFor(previewPageRequest())).toStrictEqual(TODAY);
      expect(chatFileQueries()).toEqual([]);
      expect(scannerFetch).not.toHaveBeenCalled();
    });

    it('reads no extra workspace for a page storage does not list', async () => {
      const baseline = await workspaceReadsWithoutTheFlag(previewPageRequest());
      expect(await workspaceReadsFor(previewPageRequest())).toBe(baseline);
    });

    it('offers large files once the storage CORS rule lists the page', async () => {
      vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', PREVIEW_ORIGIN);

      expect(await limitsFor(previewPageRequest())).toMatchObject({
        large_files_available: true,
      });
    });
  });
});
