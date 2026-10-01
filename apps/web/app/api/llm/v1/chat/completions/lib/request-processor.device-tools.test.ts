import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_WORKSPACE_CONTROLS, getDefaultModelFor } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/connector-policy-service');
type ScanModule1 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule2 = typeof import('./chat-attachment-hydration');
type ScanModule3 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule4 = typeof import('@/lib/server/user-identity');
type ScanModule5 = typeof import('@/lib/services/managed-usage-request-service');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  webDomains: vi.fn(),
}));

vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readWorkspaceWebDomainPolicy: mocks.webDomains,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

import { CreditService } from '@/lib/services/credit-service';
import {
  DEVICE_HOST_HEADER,
  encodeDesktopHostDeclaration,
  type DesktopHostDeclaration,
} from '@agiworkforce/local-runtime-contract';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

const DISABLED_POLICY = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-09-01T00:00:00Z'),
  current_period_end: new Date('2026-10-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const DECLARATION: DesktopHostDeclaration = {
  deviceId: 'device-abc',
  deviceName: 'Work MacBook',
  platform: 'darwin',
  appVersion: '1.2.3',
  capabilities: ['filesystem.read'],
  roots: [{ id: 'root-1', name: 'Documents', path: '/Users/qa/Documents' }],
};

function chatRequest(key: string, surface: string, declare: boolean): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': surface,
      ...(declare ? { [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(DECLARATION) } : {}),
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'read notes.md in my Documents folder' }],
      stream: true,
    }),
  });
}

function auth(overrides: Partial<AuthGateSuccess> = {}): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
    boundSurface: 'web',
    ...overrides,
  };
}

function toolNames(tools: unknown[] | undefined): string[] {
  return (tools ?? []).flatMap((tool) => {
    const fn = (tool as { function?: { name?: unknown } }).function;
    return typeof fn?.name === 'string' ? [fn.name] : [];
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.webDomains.mockResolvedValue(null);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'device-tools',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('device tools are bound to a declared desktop host', () => {
  it('offers them to a desktop caller that declared its folders', async () => {
    const result = await processRequest(chatRequest('device-desktop-1', 'desktop', true), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('desktop');
    expect(result.deviceHost?.deviceId).toBe('device-abc');
    expect(toolNames(result.llmRequest.tools)).toContain('device_read_file');
  });

  it('offers none to a browser tab that sends the same declaration', async () => {
    const result = await processRequest(chatRequest('device-web-1', 'web', true), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('web');
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });

  it.each(['mobile', 'chrome', 'vscode', 'cli'])(
    'offers none to a %s caller that sends the same declaration',
    async (surface) => {
      const result = await processRequest(
        chatRequest(`device-${surface}-1`, surface, true),
        auth(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.deviceHost).toBeUndefined();
      expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
    },
  );

  it('offers none to a desktop caller that declared nothing', async () => {
    const result = await processRequest(chatRequest('device-desktop-2', 'desktop', false), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });

  it('offers none to an api key, whatever header it sends', async () => {
    const result = await processRequest(
      chatRequest('device-api-1', 'desktop', true),
      auth({ token: 'sk_live_abc123' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('api');
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });
});

describe('phone steps are bound to the mobile app', () => {
  const PHONE: DesktopHostDeclaration = {
    deviceId: 'install-phone-1',
    deviceName: 'iPhone',
    platform: 'ios',
    appVersion: '1.0.0',
    capabilities: ['calendar.read', 'calendar.write', 'reminders.write', 'shell.execute'],
    roots: [],
  };

  function phoneRequest(key: string, surface: string): NextRequest {
    return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        'x-agi-surface': surface,
        [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(PHONE),
      },
      body: JSON.stringify({
        model: PRO_CHAT_MODEL,
        messages: [{ role: 'user', content: 'what is on my calendar tomorrow' }],
        stream: true,
      }),
    });
  }

  it('offers the phone steps, and only those, to the mobile app', async () => {
    const result = await processRequest(
      phoneRequest('phone-mobile-1', 'mobile'),
      auth({ boundSurface: 'mobile' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('mobile');
    expect(result.deviceHost?.capabilities).toEqual([
      'calendar.read',
      'calendar.write',
      'reminders.write',
    ]);
    const names = toolNames(result.llmRequest.tools).filter((name) => name.startsWith('device_'));
    expect(names.sort()).toEqual([
      'device_calendar_availability',
      'device_calendar_create_event',
      'device_calendar_events',
      'device_reminder_create',
    ]);
  });

  it('offers no phone step to a desktop that claims one', async () => {
    const result = await processRequest(phoneRequest('phone-desktop-1', 'desktop'), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceHost?.capabilities).toEqual(['shell.execute']);
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_calendar_events');
  });

  it('offers nothing to the mobile app when it declares only desktop steps', async () => {
    const result = await processRequest(
      chatRequest('phone-mobile-2', 'mobile', true),
      auth({ boundSurface: 'mobile' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });
});

describe('workspace feature controls reach the turn', () => {
  const computerUseOff = {
    ...DEFAULT_WORKSPACE_CONTROLS,
    featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, computer_use: false },
    appliedOverrideIds: [],
  };

  it('withholds computer-use tools from a desktop whose workspace turned computer use off', async () => {
    const declared = { ...DECLARATION, capabilities: ['filesystem.read', 'computer.use'] };
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'device-controls-1',
        'x-agi-surface': 'desktop',
        [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(declared as DesktopHostDeclaration),
      },
      body: JSON.stringify({
        model: PRO_CHAT_MODEL,
        messages: [{ role: 'user', content: 'take a screenshot' }],
        stream: true,
      }),
    });

    const result = await processRequest(request, auth(), { workspaceControls: computerUseOff });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceHost?.capabilities).toEqual(['filesystem.read']);
    const names = toolNames(result.llmRequest.tools);
    expect(names).toContain('device_read_file');
    expect(
      names.some(
        (name) =>
          name.startsWith('device_') &&
          name !== 'device_read_file' &&
          name !== 'device_list_folder' &&
          name !== 'device_find_files' &&
          name !== 'device_search_text',
      ),
    ).toBe(false);
  });

  it('carries the workspace website rules to a desktop that may drive its browser', async () => {
    const rules = { allow: [], deny: ['blocked.example'] };
    mocks.webDomains.mockResolvedValue(rules);
    const declared = { ...DECLARATION, capabilities: ['filesystem.read', 'browser.site'] };
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'device-browser-rules-1',
        'x-agi-surface': 'desktop',
        [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(declared as DesktopHostDeclaration),
      },
      body: JSON.stringify({
        model: PRO_CHAT_MODEL,
        messages: [{ role: 'user', content: 'open the report in my browser' }],
        stream: true,
      }),
    });

    const result = await processRequest(request, auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceWebDomainPolicy).toEqual(rules);
  });

  it('refuses a Work turn before reserving anything when the workspace turned Work off', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'work-off-1',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: PRO_CHAT_MODEL,
        messages: [{ role: 'user', content: 'plan the migration' }],
        work_mode: 'agiwork',
        stream: true,
      }),
    });

    const result = await processRequest(request, auth(), {
      workspaceControls: {
        ...DEFAULT_WORKSPACE_CONTROLS,
        featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, work: false },
        appliedOverrideIds: [],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({
      error: { code: 'feature_disabled', feature: 'work' },
    });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });
});
