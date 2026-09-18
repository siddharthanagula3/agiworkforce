import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cors', () => ({ getSecurityHeaders: () => ({}) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({ acquireManagedTurnSlot: vi.fn() }));

import { managedTurnSlotExhaustedResponse } from './turn-slot';
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
