import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErrorEvent } from '@sentry/nextjs';

import {
  hasTelemetryConsent,
  isSentryConfigured,
  redactDeep,
  scrubBreadcrumb,
  scrubEvent,
  setTelemetryConsentCache,
  TELEMETRY_CONSENT_STORAGE_KEY,
} from '../sentry-shared';

type Obj = Record<string, unknown>;

describe('sentry-shared PII scrub', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('keeps only a stable user id once telemetry is consented (drops email, username, ip)', () => {
    setTelemetryConsentCache(true);
    const event = {
      user: { id: 'u1', email: 'a@b.com', username: 'bob', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { user?: Obj };
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('drops the user object entirely when telemetry consent is absent', () => {
    window.localStorage.clear();
    const event = {
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { user?: Obj };
    expect(out.user).toBeUndefined();
    expect('user' in (out as object)).toBe(false);
  });

  it('drops the user id on the server/edge runtime, where no consent signal is readable', () => {
    setTelemetryConsentCache(true);
    const storage = window.localStorage;
    vi.stubGlobal('window', undefined);
    try {
      const event = { user: { id: 'u1' } } as unknown as ErrorEvent;
      const out = scrubEvent(event) as unknown as { user?: Obj };
      expect(out.user).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
      expect(storage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('true');
    }
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

  it('masks credentials and emails inside the exception message and stack frames', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'upstream rejected sk_test_FAKEFAKEFAKE0000 for person@example.com',
            mechanism: { type: 'generic', handled: false, data: { url: 'Bearer notarealtoken1' } },
            stacktrace: {
              frames: [
                {
                  filename: '/srv/app/handler.ts?key=AIzaFAKEFAKEFAKEFAKEFAKE0',
                  function: 'callUpstream',
                  context_line: "const key = 'sk_live_EXAMPLEEXAMPLE0001';",
                  pre_context: ['// person@example.com owns this'],
                  vars: { apiKey: 'sk_live_EXAMPLEEXAMPLE0002', retries: 2 },
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event) as unknown as ErrorEvent;
    const value = out.exception?.values?.[0];
    const frame = value?.stacktrace?.frames?.[0];

    expect(value?.value).toBe('upstream rejected [redacted] for [redacted]');
    expect(value?.value).not.toContain('FAKEFAKEFAKE0000');
    expect(value?.value).not.toContain('person@example.com');
    expect(value?.mechanism?.data?.['url']).toBe('[redacted]');
    expect(frame?.filename).toBe('/srv/app/handler.ts?key=[redacted]');
    expect(frame?.function).toBe('callUpstream');
    expect(frame?.context_line).toBe("const key = '[redacted]';");
    expect(frame?.pre_context?.[0]).toBe('// [redacted] owns this');
    expect(frame?.vars?.['apiKey']).toBe('[redacted]');
    expect(frame?.vars?.['retries']).toBe(2);
  });

  it('masks the top-level message, logentry, and breadcrumb messages', () => {
    const event = {
      message: 'login failed for person@example.com',
      logentry: {
        message: 'token sk_test_FAKEFAKEFAKE0003 expired',
        params: ['person@example.com'],
      },
      breadcrumbs: [{ message: 'GET /x with Bearer notarealtoken2', data: { note: 'ok' } }],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event) as unknown as ErrorEvent;

    expect(out.message).toBe('login failed for [redacted]');
    expect(out.logentry?.message).toBe('token [redacted] expired');
    expect(out.logentry?.params?.[0]).toBe('[redacted]');
    expect(out.breadcrumbs?.[0]?.message).toBe('GET /x with [redacted]');
    expect(out.breadcrumbs?.[0]?.data?.['note']).toBe('ok');
  });

  it('masks secret-shaped values in breadcrumb data even under a benign key', () => {
    const out = scrubBreadcrumb({
      message: 'fetch',
      data: { url: 'https://api.example.com?k=AIzaFAKEFAKEFAKEFAKEFAKE1' },
    });
    expect(out.data?.['url']).toBe('https://api.example.com?k=[redacted]');
  });

  it('is default-disabled outside production (no DSN / not production)', () => {
    expect(isSentryConfigured()).toBe(false);
  });
});

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
