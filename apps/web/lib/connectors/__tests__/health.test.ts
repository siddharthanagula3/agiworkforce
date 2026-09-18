import { describe, expect, it, vi, beforeEach } from 'vitest';

const recordConnectorCall = vi.fn();
const recordConnectorCallOutcome = vi.fn();

vi.mock('@/lib/services/infrastructure-cost', () => ({
  recordConnectorCall: (...args: unknown[]) => recordConnectorCall(...args),
}));

vi.mock('@/lib/services/connector-call-log-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/connector-call-log-service')>();
  return {
    ...actual,
    recordConnectorCallOutcome: (...args: unknown[]) => recordConnectorCallOutcome(...args),
  };
});

import type { ConnectorCallEntry } from '@/lib/services/connector-call-log-service';
import {
  CONNECTOR_BACKOFF_BASE_MS,
  CONNECTOR_RATE_LIMIT_MAX_CALLS,
  connectorBackoffDelayMs,
  meterConnectorCall,
  resolveConnectorGate,
  resolveConnectorRateLimit,
  summarizeConnectorHealth,
} from '@/lib/connectors/health';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');

function call(overrides: Partial<ConnectorCallEntry> & { secondsAgo: number }): ConnectorCallEntry {
  const { secondsAgo, ...rest } = overrides;
  return {
    connectorId: 'gmail',
    toolName: 'search',
    outcome: 'succeeded',
    durationMs: 200,
    occurredAt: new Date(NOW - secondsAgo * 1000).toISOString(),
    ...rest,
  };
}

beforeEach(() => {
  recordConnectorCall.mockReset();
  recordConnectorCallOutcome.mockReset();
});

describe('summarizeConnectorHealth', () => {
  it('reports latency percentiles and failure counts per connector', () => {
    const [summary] = summarizeConnectorHealth(
      [
        call({ secondsAgo: 10, durationMs: 100 }),
        call({ secondsAgo: 20, durationMs: 300 }),
        call({ secondsAgo: 30, durationMs: 900, outcome: 'failed' }),
        call({ secondsAgo: 40, outcome: 'blocked', durationMs: null }),
      ],
      NOW,
    );

    expect(summary?.connectorId).toBe('gmail');
    expect(summary?.calls).toBe(4);
    expect(summary?.meteredCalls).toBe(3);
    expect(summary?.blocked).toBe(1);
    expect(summary?.failures).toBe(1);
    expect(summary?.p50LatencyMs).toBe(300);
    expect(summary?.p95LatencyMs).toBe(900);
    expect(summary?.state).toBe('degraded');
  });

  it('marks a connector whose recent calls all failed as not responding and opens its circuit', () => {
    const [summary] = summarizeConnectorHealth(
      [
        call({ secondsAgo: 1, outcome: 'failed' }),
        call({ secondsAgo: 2, outcome: 'failed' }),
        call({ secondsAgo: 3, outcome: 'failed' }),
      ],
      NOW,
    );

    expect(summary?.state).toBe('not-responding');
    expect(summary?.consecutiveFailures).toBe(3);
    expect(summary?.circuit).toBe('open');
    expect(summary?.retryAfterMs).toBeGreaterThan(0);
  });

  it('does not count calls this platform blocked against the provider', () => {
    const [summary] = summarizeConnectorHealth(
      [
        call({ secondsAgo: 1, outcome: 'blocked' }),
        call({ secondsAgo: 2, outcome: 'blocked' }),
        call({ secondsAgo: 3, outcome: 'blocked' }),
      ],
      NOW,
    );

    expect(summary?.state).toBe('unknown');
    expect(summary?.circuit).toBe('closed');
  });
});

describe('connectorBackoffDelayMs', () => {
  it('stays closed below the streak threshold and then doubles', () => {
    expect(connectorBackoffDelayMs(2)).toBe(0);
    expect(connectorBackoffDelayMs(3)).toBe(CONNECTOR_BACKOFF_BASE_MS);
    expect(connectorBackoffDelayMs(4)).toBe(CONNECTOR_BACKOFF_BASE_MS * 2);
    expect(connectorBackoffDelayMs(40)).toBe(connectorBackoffDelayMs(41));
  });
});

describe('resolveConnectorGate', () => {
  it('refuses a call while the circuit is open and names the connector and the wait', () => {
    const decision = resolveConnectorGate(
      [
        call({ secondsAgo: 0, outcome: 'failed' }),
        call({ secondsAgo: 1, outcome: 'failed' }),
        call({ secondsAgo: 2, outcome: 'failed' }),
      ],
      { connectorId: 'gmail', connectorLabel: 'Gmail', accountLabel: 'work@example.com' },
      NOW,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('circuit-open');
    expect(decision.message).toContain('Gmail (work@example.com)');
    expect(decision.message).toContain('Nothing was sent');
  });

  it('lets a trial call through once the backoff has elapsed', () => {
    const decision = resolveConnectorGate(
      [
        call({ secondsAgo: 60, outcome: 'failed' }),
        call({ secondsAgo: 61, outcome: 'failed' }),
        call({ secondsAgo: 62, outcome: 'failed' }),
      ],
      { connectorId: 'gmail' },
      NOW,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.circuit).toBe('half-open');
  });

  it('refuses a call over the outbound ceiling for that connector alone', () => {
    const own = Array.from({ length: CONNECTOR_RATE_LIMIT_MAX_CALLS }, (_, index) =>
      call({ secondsAgo: index % 50 }),
    );
    const other = call({ secondsAgo: 1, connectorId: 'slack' });

    const gmail = resolveConnectorGate([...own, other], { connectorId: 'gmail' }, NOW);
    const slack = resolveConnectorGate([...own, other], { connectorId: 'slack' }, NOW);

    expect(gmail.allowed).toBe(false);
    expect(gmail.reason).toBe('rate-limited');
    expect(slack.allowed).toBe(true);
  });
});

describe('resolveConnectorRateLimit', () => {
  it('only counts calls inside the window', () => {
    const state = resolveConnectorRateLimit(
      [call({ secondsAgo: 5 }), call({ secondsAgo: 120 })],
      NOW,
    );
    expect(state.callsInWindow).toBe(1);
    expect(state.exceeded).toBe(false);
  });
});

describe('meterConnectorCall', () => {
  it('writes the health row and the connector cost row for one call', () => {
    meterConnectorCall({} as never, {
      userId: 'user-1',
      organizationId: 'org-1',
      connectorId: 'gmail',
      toolName: 'search',
      outcome: 'succeeded',
      durationMs: 42,
    });

    expect(recordConnectorCallOutcome).toHaveBeenCalledTimes(1);
    expect(recordConnectorCallOutcome.mock.calls[0]?.[1]).toMatchObject({
      connectorId: 'gmail',
      outcome: 'succeeded',
      durationMs: 42,
    });
    expect(recordConnectorCall).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      connectorId: 'gmail',
      toolName: 'search',
      surface: null,
    });
  });

  it('never charges for a call this platform blocked before it left', () => {
    meterConnectorCall({} as never, {
      userId: 'user-1',
      connectorId: 'gmail',
      toolName: 'send',
      outcome: 'blocked',
    });

    expect(recordConnectorCallOutcome).toHaveBeenCalledTimes(1);
    expect(recordConnectorCall).not.toHaveBeenCalled();
  });
});
