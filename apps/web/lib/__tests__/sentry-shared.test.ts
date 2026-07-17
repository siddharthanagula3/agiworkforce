import { beforeEach, describe, expect, it } from 'vitest';

import type { ErrorEvent } from '@sentry/nextjs';

import {
  hasTelemetryConsent,
  isSentryConfigured,
  redactDeep,
  scrubEvent,
  setTelemetryConsentCache,
  TELEMETRY_CONSENT_STORAGE_KEY,
} from '../sentry-shared';

type Obj = Record<string, unknown>;

// OBSERVABILITY-WEB-SENTRY-01: nothing sensitive may leave the process. These
// guard the PII scrub that runs in beforeSend on every event.
describe('sentry-shared PII scrub', () => {
  it('redacts sensitive-named keys at any depth, keeping benign data', () => {
    const out = redactDeep({
      apiKey: 'sk-123',
      nested: { authorization: 'Bearer x', prompt: 'secret prompt', safe: 'ok' },
      arr: [{ password: 'pw' }],
    }) as Obj;
    const nested = out['nested'] as Obj;
    const arr = out['arr'] as Obj[];
    expect(out['apiKey']).toBe('[redacted]');
    expect(nested['authorization']).toBe('[redacted]');
    expect(nested['prompt']).toBe('[redacted]');
    expect(nested['safe']).toBe('ok');
    expect(arr[0]?.['password']).toBe('[redacted]');
  });

  it('strips request body, cookies, query, and all headers from the event', () => {
    const event = {
      request: {
        cookies: { sid: 'abc' },
        data: { messages: [{ content: 'private chat' }] },
        query_string: 'token=jwt',
        headers: { authorization: 'Bearer x', 'user-agent': 'ua' },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { request: Obj };
    expect(out.request['cookies']).toBeUndefined();
    expect(out.request['data']).toBeUndefined();
    expect(out.request['query_string']).toBeUndefined();
    expect(out.request['headers']).toEqual({});
  });

  it('keeps only a stable user id (drops email, username, ip)', () => {
    const event = {
      user: { id: 'u1', email: 'a@b.com', username: 'bob', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { user: Obj };
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('redacts sensitive extra/contexts but keeps benign fields', () => {
    const event = {
      extra: { prompt: 'p', requestId: 'r1' },
      contexts: { custom: { secret: 's', count: 3 } },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { extra: Obj; contexts: { custom: Obj } };
    expect(out.extra['prompt']).toBe('[redacted]');
    expect(out.extra['requestId']).toBe('r1');
    expect(out.contexts.custom['secret']).toBe('[redacted]');
    expect(out.contexts.custom['count']).toBe(3);
  });

  it('is default-disabled outside production (no DSN / not production)', () => {
    // Under vitest NODE_ENV is 'test', so Sentry must report not-configured.
    expect(isSentryConfigured()).toBe(false);
  });
});

// Regression guard: instrumentation-client.ts must never call Sentry.init()
// while the user's "Share crash and usage telemetry" toggle (default OFF)
// hasn't explicitly synced to this device as opted-in — an opt-out that gets
// silently ignored is a privacy defect, not a cosmetic bug.
describe('telemetry consent cache (client-side Sentry gate)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to false (no telemetry) when nothing has been cached yet', () => {
    expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBeNull();
    expect(hasTelemetryConsent()).toBe(false);
  });

  it('reflects true only after an explicit opt-in is cached', () => {
    setTelemetryConsentCache(true);
    expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('true');
    expect(hasTelemetryConsent()).toBe(true);
  });

  it('reverts to false once opt-out is cached again', () => {
    setTelemetryConsentCache(true);
    expect(hasTelemetryConsent()).toBe(true);
    setTelemetryConsentCache(false);
    expect(hasTelemetryConsent()).toBe(false);
  });

  it('treats a corrupted/unexpected stored value as no consent', () => {
    window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, 'yes-please');
    expect(hasTelemetryConsent()).toBe(false);
  });
});
