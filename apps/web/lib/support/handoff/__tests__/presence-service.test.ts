
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({ listFreshOnlineAgents: vi.fn() }));

vi.mock('@/lib/support/handoff/store', () => storeMocks);
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { clearAvailabilityCache, resolveHumanAvailability } from '../presence-service';

function healthyAgent(overrides: Record<string, unknown> = {}) {
  return {
    agent_user_id: 'user_agent_1',
    display_name: 'Sam',
    status: 'online' as const,
    max_concurrent_sessions: 3,
    last_heartbeat_at: new Date().toISOString(),
    active_sessions: 0,
    ...overrides,
  };
}

describe('resolveHumanAvailability · gate 1: deployment switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvailabilityCache();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is UNAVAILABLE when AGI_SUPPORT_LIVE_HANDOFF_ENABLED is unset, even with a healthy agent online', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([healthyAgent()]);
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '');

    const availability = await resolveHumanAvailability();

    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('not_configured');
    expect(availability.headline).toBe('No one is available right now');
    expect(storeMocks.listFreshOnlineAgents).not.toHaveBeenCalled();
  });

  it('is UNAVAILABLE for a non-truthy value like "0"', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([healthyAgent()]);
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '0');

    const availability = await resolveHumanAvailability();
    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('not_configured');
  });
});

describe('resolveHumanAvailability · gates 2-4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvailabilityCache();
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '1');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('gate 2: an empty roster is UNAVAILABLE', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([]);

    const availability = await resolveHumanAvailability();
    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('no_agents_online');
  });

  it('gate 3: a stale heartbeat is filtered in SQL, so a status=online row alone never makes a human available', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([]);
    vi.stubEnv('AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS', '90');

    const availability = await resolveHumanAvailability();

    expect(storeMocks.listFreshOnlineAgents).toHaveBeenCalledWith(90);
    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('no_agents_online');
  });

  it('gate 4: every fresh agent at capacity is UNAVAILABLE', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([
      healthyAgent({ max_concurrent_sessions: 2, active_sessions: 2 }),
      healthyAgent({
        agent_user_id: 'user_agent_2',
        max_concurrent_sessions: 1,
        active_sessions: 1,
      }),
    ]);

    const availability = await resolveHumanAvailability();
    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('at_capacity');
  });

  it('is LIVE only when all four gates pass', async () => {
    storeMocks.listFreshOnlineAgents.mockResolvedValue([healthyAgent()]);

    const availability = await resolveHumanAvailability();
    expect(availability.live).toBe(true);
    expect(availability.reason).toBe('live');
    expect(availability.headline).toBe('Someone is available now');
    expect(availability.waitTimeoutSeconds).toBeGreaterThan(0);
  });

  it('fails CLOSED when the presence lookup throws', async () => {
    storeMocks.listFreshOnlineAgents.mockRejectedValue(new Error('neon is down'));

    const availability = await resolveHumanAvailability();
    expect(availability.live).toBe(false);
    expect(availability.reason).toBe('no_agents_online');
  });

  it('never claims a human in ANY unavailable state and never emits connecting copy', async () => {
    for (const agents of [[], [healthyAgent({ max_concurrent_sessions: 0, active_sessions: 0 })]]) {
      clearAvailabilityCache();
      storeMocks.listFreshOnlineAgents.mockResolvedValue(agents);
      const availability = await resolveHumanAvailability({ skipCache: true });
      expect(availability.live).toBe(false);
      expect(JSON.stringify(availability).toLowerCase()).not.toContain('connecting');
      expect(availability.headline).toBe('No one is available right now');
      expect(availability.fallback.address.length).toBeGreaterThan(0);
    }
  });

  it('surfaces fallback.configured=false when no email provider is wired up, instead of implying delivery', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    storeMocks.listFreshOnlineAgents.mockResolvedValue([]);

    const availability = await resolveHumanAvailability();
    expect(availability.fallback.configured).toBe(false);
    expect(availability.detail).toContain('nothing will be sent automatically');
  });
});
