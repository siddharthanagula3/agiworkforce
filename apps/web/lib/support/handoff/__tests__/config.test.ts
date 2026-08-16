
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EXPECTED_REPLY,
  DEFAULT_FALLBACK_EMAIL,
  getHandoffConfig,
  heartbeatIntervalMs,
  isValidEmail,
} from '../config';

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of [
    'AGI_SUPPORT_LIVE_HANDOFF_ENABLED',
    'AGI_SUPPORT_FALLBACK_EMAIL',
    'AGI_SUPPORT_FROM_EMAIL',
    'AGI_SUPPORT_EXPECTED_REPLY_COPY',
    'AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS',
    'AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS',
    'RESEND_API_KEY',
  ]) {
    vi.stubEnv(key, '');
  }
});

afterEach(() => vi.unstubAllEnvs());

describe('getHandoffConfig · fail-closed defaults', () => {
  it('defaults live handoff to OFF', () => {
    expect(getHandoffConfig().liveHandoffEnabled).toBe(false);
  });

  it('reports email as UNCONFIGURED without RESEND_API_KEY, even though the addresses default', () => {
    const config = getHandoffConfig();
    expect(config.fallbackEmail).toBe(DEFAULT_FALLBACK_EMAIL);
    expect(config.fromEmail).toBe(DEFAULT_FALLBACK_EMAIL);
    expect(config.emailConfigured).toBe(false);
  });

  it('only reports email configured when a key AND valid addresses are present', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    expect(getHandoffConfig().emailConfigured).toBe(true);
  });

  it('falls back to the default address when the configured one is junk, rather than pretending it is valid', () => {
    vi.stubEnv('AGI_SUPPORT_FALLBACK_EMAIL', 'not-an-address');
    expect(getHandoffConfig().fallbackEmail).toBe(DEFAULT_FALLBACK_EMAIL);
  });

  it.each([
    ['1', true],
    ['true', true],
    ['on', true],
    ['yes', true],
    ['0', false],
    ['false', false],
    ['off', false],
    ['maybe', false],
    ['', false],
  ])('AGI_SUPPORT_LIVE_HANDOFF_ENABLED=%s ⇒ %s', (raw, expected) => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', raw);
    expect(getHandoffConfig().liveHandoffEnabled).toBe(expected);
  });

  it('keeps the reply promise configurable so a deployment can tell the truth about its own staffing', () => {
    expect(getHandoffConfig().expectedReplyCopy).toBe(DEFAULT_EXPECTED_REPLY);
    vi.stubEnv('AGI_SUPPORT_EXPECTED_REPLY_COPY', 'within three business days');
    expect(getHandoffConfig().expectedReplyCopy).toBe('within three business days');
  });

  it('clamps nonsense timeouts instead of disabling them', () => {
    vi.stubEnv('AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS', '0');
    expect(getHandoffConfig().waitTimeoutSeconds).toBe(15);

    vi.stubEnv('AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS', '999999');
    expect(getHandoffConfig().waitTimeoutSeconds).toBe(900);

    vi.stubEnv('AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS', 'banana');
    expect(getHandoffConfig().waitTimeoutSeconds).toBe(120);
  });

  it('keeps the heartbeat cadence comfortably inside the TTL', () => {
    vi.stubEnv('AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS', '90');
    const config = getHandoffConfig();
    expect(heartbeatIntervalMs(config)).toBeLessThan(config.heartbeatTtlSeconds * 1000);
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'customer@example.com', 'first.last@sub.domain.org'])(
    'accepts %s',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(['', 'nope', 'a@b', 'a@@b.com', 'a b@c.com', undefined, null])('rejects %s', (value) => {
    expect(isValidEmail(value as string | null | undefined)).toBe(false);
  });
});
