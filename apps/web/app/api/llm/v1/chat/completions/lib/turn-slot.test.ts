import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cors', () => ({ getSecurityHeaders: () => ({}) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({ acquireManagedTurnSlot: vi.fn() }));

import { acquireManagedTurnSlot } from '@/lib/rate-limit';
import { managedTurnSlotExhaustedResponse, withManagedTurnSlot } from './turn-slot';
import type { ManagedTurnSlotResult } from '@/lib/rate-limit';

function denial(overrides: Partial<ManagedTurnSlotResult> = {}): ManagedTurnSlotResult {
  return { admitted: false, limit: 3, active: 3, slot: null, ...overrides };
}

describe('the concurrent-turn ceiling explains itself', () => {
  it('names the ceiling, the cause and the two ways out', async () => {
    const response = managedTurnSlotExhaustedResponse(denial());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('concurrent_turn_limit_reached');
    expect(body.error.concurrent_turn_limit).toBe(3);
    expect(body.error.active_turns).toBe(3);
    expect(body.error.message).toContain('3 responses at a time');
    expect(body.error.message).toMatch(/stop a running response/i);
    expect(body.error.message).toMatch(/upgrading raises this limit/i);
  });

  it('reads as one response when the ceiling is one', async () => {
    const body = await managedTurnSlotExhaustedResponse(denial({ limit: 1, active: 1 })).json();
    expect(body.error.message).toContain('1 response at a time');
    expect(body.error.message).toContain('one is already running');
  });

  it('points a plan with no concurrent turns at the upgrade instead of a count', async () => {
    const body = await managedTurnSlotExhaustedResponse(denial({ limit: 0, active: 0 })).json();
    expect(body.error.message).toMatch(/does not include concurrent managed responses/i);
  });

  it('puts the ceiling and the live count on the headers for the client to read', () => {
    const response = managedTurnSlotExhaustedResponse(denial());
    expect(response.headers.get('X-AGI-Concurrent-Turn-Limit')).toBe('3');
    expect(response.headers.get('X-AGI-Concurrent-Turns-Active')).toBe('3');
  });

  it('distinguishes an unverifiable limiter from a reached one, and says when to retry', async () => {
    const response = managedTurnSlotExhaustedResponse(
      denial({ denial: 'limiter-unavailable', limit: null }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('concurrency_limiter_unavailable');
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('X-AGI-Concurrent-Turn-Limit')).toBeNull();
  });
});

describe('a detached resume keeps its slot until the server finishes it', () => {
  it('refuses a second detached resume over the ceiling while the first is still draining', async () => {
    let active = 0;
    const limit = 1;
    vi.mocked(acquireManagedTurnSlot).mockImplementation(async () => {
      if (active >= limit) return { admitted: false, limit, active, slot: null };
      active += 1;
      return {
        admitted: true,
        limit,
        active,
        slot: {
          release: async () => {
            active -= 1;
          },
        },
      } as unknown as ManagedTurnSlotResult;
    });
    const caller = { userId: 'user-1', planTier: 'pro' };
    let finishDrain: () => void = () => undefined;
    const drain = new Promise<void>((resolve) => {
      finishDrain = resolve;
    });
    const detached = () =>
      withManagedTurnSlot(caller, async (hold) => {
        hold.holdUntil(drain);
        return new Response(new ReadableStream(), {
          headers: { 'content-type': 'text/event-stream' },
        });
      });

    const first = await detached();
    await first.body?.cancel();
    const second = await detached();
    expect(second.status).toBe(429);

    finishDrain();
    await drain;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const third = await detached();
    expect(third.status).toBe(200);
  });
});
