/**
 * GET /api/support/handoff/availability — the endpoint that lets the widget tell
 * the truth BEFORE the user commits to anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  listFreshOnlineAgents: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', () => ({
  listFreshOnlineAgents: mocks.listFreshOnlineAgents,
}));

import { GET } from '../availability/route';
import { clearAvailabilityCache } from '@/lib/support/handoff/presence-service';

function req() {
  return new Request('http://localhost/api/support/handoff/availability') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAvailabilityCache();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.listFreshOnlineAgents.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/support/handoff/availability', () => {
  it('reports UNAVAILABLE on an unconfigured deployment and names the email fallback', async () => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '');

    const response = await GET(req());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.live).toBe(false);
    expect(payload.reason).toBe('not_configured');
    expect(payload.headline).toBe('No one is available right now');
    expect(payload.fallback.channel).toBe('email');
    expect(payload.fallback.address).toContain('@');
    // The widget must be able to bound any waiting UI it later renders.
    expect(payload.waitTimeoutSeconds).toBeGreaterThan(0);
    expect(payload.pollIntervalMs).toBeGreaterThan(0);
  });

  it('reports LIVE only with the switch on and a fresh, uncapacitated agent', async () => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '1');
    mocks.listFreshOnlineAgents.mockResolvedValue([
      {
        agent_user_id: 'user_agent_1',
        display_name: 'Sam',
        status: 'online',
        max_concurrent_sessions: 3,
        last_heartbeat_at: new Date().toISOString(),
        active_sessions: 1,
      },
    ]);

    const payload = await (await GET(req())).json();

    expect(payload.live).toBe(true);
    expect(payload.reason).toBe('live');
  });

  it('is never cached by a CDN — presence goes stale on a ~90s heartbeat', async () => {
    const response = await GET(req());
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('honours the rate limit', async () => {
    mocks.withRateLimit.mockResolvedValue(
      new Response('slow', { status: 429 }) as unknown as never,
    );

    const response = await GET(req());

    expect(response.status).toBe(429);
    expect(mocks.listFreshOnlineAgents).not.toHaveBeenCalled();
  });
});
