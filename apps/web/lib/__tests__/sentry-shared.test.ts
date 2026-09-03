import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErrorEvent } from '@sentry/nextjs';

import type { SpanJSON, TransactionEvent } from '../sentry-shared';
import {
  commonInitOptions,
  hasTelemetryConsent,
  isSentryConfigured,
  readDocumentTelemetryConsent,
  redactDeep,
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
  scrubTransactionEvent,
  setTelemetryConsentCache,
  shouldInitializeSentry,
  TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE,
  TELEMETRY_CONSENT_STORAGE_KEY,
} from '../sentry-shared';

type Obj = Record<string, unknown>;

const REQUEST_ERROR_OAUTH_CODE = 'oauth_code_req_err_001';

// Shaped like what @sentry/nextjs onRequestError -> captureRequestError produces:
// the nextjs context carries the raw request target, query string included.
function captureRequestErrorEvent(): ErrorEvent {
  return {
    transaction: 'GET /api/github/oauth/callback',
    exception: {
      values: [
        {
          type: 'Error',
          value: 'lookup failed',
          mechanism: { type: 'auto.function.nextjs.on_request_error', handled: false },
        },
      ],
    },
    request: { method: 'GET', headers: { 'user-agent': 'ua' } },
    contexts: {
      nextjs: {
        request_path: `/api/github/oauth/callback?state=s1&code=${REQUEST_ERROR_OAUTH_CODE}`,
        router_kind: 'App Router',
        router_path: '/api/github/oauth/callback',
        route_type: 'route',
      },
    },
  } as unknown as ErrorEvent;
}

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

  it('drops the query string and fragment from request.url, keeping the path', () => {
    const event = {
      request: {
        method: 'GET',
        url: 'https://app.example.com/api/github/oauth/callback?state=s1&code=oauth_code_abc123',
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { request: Obj };
    expect(out.request['url']).toBe('https://app.example.com/api/github/oauth/callback');
    expect(out.request['url']).not.toContain('oauth_code_abc123');
    expect(out.request['url']).not.toContain('code=');
  });

  it('drops a fragment-carried token from request.url and the transaction name', () => {
    const event = {
      transaction: 'GET /auth/verify?token=magic_link_token_xyz',
      request: { url: '/auth/verify#access_token=implicit_token_xyz' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { transaction: string; request: Obj };
    expect(out.request['url']).toBe('/auth/verify');
    expect(out.transaction).toBe('GET /auth/verify');
    expect(out.transaction).not.toContain('magic_link_token_xyz');
  });

  it('leaves a query-free url and transaction untouched', () => {
    const event = {
      transaction: 'GET /api/projects',
      request: { url: 'https://app.example.com/api/projects' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { transaction: string; request: Obj };
    expect(out.request['url']).toBe('https://app.example.com/api/projects');
    expect(out.transaction).toBe('GET /api/projects');
  });

  it('drops the query string from the exception mechanism url', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'fetch failed',
            mechanism: {
              type: 'http',
              handled: true,
              data: { url: 'https://app.example.com/callback?code=oauth_code_def456' },
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as ErrorEvent;
    expect(out.exception?.values?.[0]?.mechanism?.data?.['url']).toBe(
      'https://app.example.com/callback',
    );
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

  it('drops the query string from the nextjs context request_path (captureRequestError shape)', () => {
    const event = captureRequestErrorEvent();
    const out = scrubEvent(event) as unknown as { contexts: { nextjs: Obj } };
    expect(out.contexts.nextjs['request_path']).toBe('/api/github/oauth/callback');
    expect(out.contexts.nextjs['router_path']).toBe('/api/github/oauth/callback');
    expect(out.contexts.nextjs['router_kind']).toBe('App Router');
    expect(out.contexts.nextjs['route_type']).toBe('route');
    expect(JSON.stringify(out)).not.toContain(REQUEST_ERROR_OAUTH_CODE);
  });

  it('drops the query string from url-like context strings at any depth', () => {
    const event = {
      contexts: {
        app: {
          app_start_url: 'https://app.example.com/auth/verify?token=nested_ctx_token_001',
          nested: { location: '/invite#invite=nested_ctx_token_002' },
          app_name: 'agiworkforce',
        },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event) as unknown as { contexts: { app: Obj } };
    const nested = out.contexts.app['nested'] as Obj;
    expect(out.contexts.app['app_start_url']).toBe('https://app.example.com/auth/verify');
    expect(nested['location']).toBe('/invite');
    expect(out.contexts.app['app_name']).toBe('agiworkforce');
    expect(JSON.stringify(out)).not.toContain('nested_ctx_token_001');
    expect(JSON.stringify(out)).not.toContain('nested_ctx_token_002');
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

  it('drops the whole query string from a breadcrumb url, secret-shaped or not', () => {
    const out = scrubBreadcrumb({
      message: 'fetch',
      data: {
        url: 'https://api.example.com/v1/exchange?k=AIzaFAKEFAKEFAKEFAKEFAKE1&code=oauth_code_ghi789',
        status_code: 500,
      },
    });
    expect(out.data?.['url']).toBe('https://api.example.com/v1/exchange');
    expect(out.data?.['url']).not.toContain('oauth_code_ghi789');
    expect(out.data?.['status_code']).toBe(500);
  });

  it('drops the query string from navigation breadcrumb from/to, not just url', () => {
    const out = scrubBreadcrumb({
      category: 'navigation',
      data: {
        from: '/auth/verify?token=magic_link_from_001',
        to: '/dashboard?invite=invite_token_002#section',
      },
    });
    expect(out.data?.['from']).toBe('/auth/verify');
    expect(out.data?.['to']).toBe('/dashboard');
    expect(JSON.stringify(out)).not.toContain('magic_link_from_001');
    expect(JSON.stringify(out)).not.toContain('invite_token_002');
  });

  it('is default-disabled outside production (no DSN / not production)', () => {
    expect(isSentryConfigured()).toBe(false);
  });
});

const TRANSACTION_OAUTH_CODE = 'oauth_code_trx_001';

function sampledOAuthTransaction(): TransactionEvent {
  const url = `https://app.example.com/api/github/oauth/callback?state=s1&code=${TRANSACTION_OAUTH_CODE}`;
  return {
    type: 'transaction',
    transaction: `GET /api/github/oauth/callback?code=${TRANSACTION_OAUTH_CODE}`,
    request: {
      method: 'GET',
      url,
      query_string: `state=s1&code=${TRANSACTION_OAUTH_CODE}`,
      cookies: { __session: 'sess_abc' },
      headers: { cookie: '__session=sess_abc', 'user-agent': 'ua' },
      data: { code: TRANSACTION_OAUTH_CODE },
    },
    contexts: {
      trace: {
        trace_id: 'trace1',
        span_id: 'span1',
        data: {
          'url.full': url,
          'url.query': `?state=s1&code=${TRANSACTION_OAUTH_CODE}`,
          'http.request.method': 'GET',
          'http.request.header.cookie.__session': 'sess_abc',
          'http.request.body.data': `{"code":"${TRANSACTION_OAUTH_CODE}"}`,
          'http.response.status_code': 500,
        },
      },
    },
    spans: [
      {
        span_id: 'span2',
        trace_id: 'trace1',
        start_timestamp: 0,
        description: `GET https://github.com/login/oauth/access_token?code=${TRANSACTION_OAUTH_CODE}`,
        data: { 'url.full': `https://github.com/x?code=${TRANSACTION_OAUTH_CODE}` },
      },
    ],
  } as unknown as TransactionEvent;
}

describe('sentry-shared transaction and span scrub', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('registers a scrubber for transaction events and spans, not only errors', () => {
    const options = commonInitOptions();
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubTransactionEvent);
    expect(options.beforeSendSpan).toBe(scrubSpan);
  });

  it('never lets an oauth code out on the sampled transaction path', () => {
    const out = scrubTransactionEvent(sampledOAuthTransaction()) as TransactionEvent;
    expect(JSON.stringify(out)).not.toContain(TRANSACTION_OAUTH_CODE);
  });

  it('strips request url, query, cookies, body and headers from a transaction event', () => {
    const out = scrubTransactionEvent(sampledOAuthTransaction()) as unknown as { request: Obj };
    expect(out.request['url']).toBe('https://app.example.com/api/github/oauth/callback');
    expect(out.request['query_string']).toBeUndefined();
    expect(out.request['cookies']).toBeUndefined();
    expect(out.request['data']).toBeUndefined();
    expect(out.request['headers']).toEqual({});
  });

  it('drops the query from the transaction name and from root-span request attributes', () => {
    const out = scrubTransactionEvent(sampledOAuthTransaction()) as TransactionEvent;
    const trace = out.contexts?.['trace']?.['data'] as Obj;
    expect(out.transaction).toBe('GET /api/github/oauth/callback');
    expect(trace['url.full']).toBe('https://app.example.com/api/github/oauth/callback');
    expect(trace['url.query']).toBe('[redacted]');
    expect(trace['http.request.header.cookie.__session']).toBe('[redacted]');
    expect(trace['http.request.body.data']).toBe('[redacted]');
    expect(trace['http.request.method']).toBe('GET');
    expect(trace['http.response.status_code']).toBe(500);
  });

  it('drops the query from child span descriptions and attributes', () => {
    const out = scrubTransactionEvent(sampledOAuthTransaction()) as TransactionEvent;
    const span = out.spans?.[0] as unknown as { description: string; data: Obj };
    expect(span.description).toBe('GET https://github.com/login/oauth/access_token');
    expect(span.data['url.full']).toBe('https://github.com/x');
  });

  it('scrubs a standalone span the same way, keeping non-url attributes', () => {
    const span = scrubSpan({
      span_id: 'span3',
      trace_id: 'trace2',
      start_timestamp: 0,
      description: 'GET /api/connectors/oauth/callback?code=oauth_code_span_002',
      data: {
        'url.full':
          'https://app.example.com/api/connectors/oauth/callback?code=oauth_code_span_002',
        'url.path': '/api/connectors/oauth/callback',
        'url.query': '?code=oauth_code_span_002',
        'http.request.header.authorization': 'Bearer notarealtoken3',
        'http.response.status_code': 302,
        'sentry.op': 'http.server',
      },
    } as unknown as SpanJSON);
    expect(span.description).toBe('GET /api/connectors/oauth/callback');
    expect(span.data['url.full']).toBe('https://app.example.com/api/connectors/oauth/callback');
    expect(span.data['url.query']).toBe('[redacted]');
    expect(span.data['http.request.header.authorization']).toBe('[redacted]');
    expect(span.data['http.response.status_code']).toBe(302);
    expect(span.data['sentry.op']).toBe('http.server');
    expect(JSON.stringify(span)).not.toContain('oauth_code_span_002');
  });

  it('keeps the placeholders of a parameterised db statement', () => {
    const span = scrubSpan({
      span_id: 'span4',
      trace_id: 'trace3',
      start_timestamp: 0,
      op: 'db',
      description: 'SELECT * FROM projects WHERE owner_id = ? AND slug = ?',
      data: { 'db.system': 'postgresql' },
    } as unknown as SpanJSON);
    expect(span.description).toBe('SELECT * FROM projects WHERE owner_id = ? AND slug = ?');
  });

  it('drops the query string from the nextjs context on the transaction path too', () => {
    const event = {
      ...captureRequestErrorEvent(),
      type: 'transaction',
    } as unknown as TransactionEvent;
    const out = scrubTransactionEvent(event) as unknown as { contexts: { nextjs: Obj } };
    expect(out.contexts.nextjs['request_path']).toBe('/api/github/oauth/callback');
    expect(JSON.stringify(out)).not.toContain(REQUEST_ERROR_OAUTH_CODE);
  });

  it('drops the user from a transaction event without telemetry consent', () => {
    const event = {
      type: 'transaction',
      transaction: 'GET /api/projects',
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
    } as unknown as TransactionEvent;
    const out = scrubTransactionEvent(event) as unknown as { user?: Obj };
    expect(out.user).toBeUndefined();
  });
});

describe('commonInitOptions tenant tag hook', () => {
  it('leaves the scrubbers untouched with no hook, preserving referential identity', () => {
    const options = commonInitOptions();
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubTransactionEvent);
  });

  it('runs the hook on the already-scrubbed error event and keeps the scrub result', () => {
    const seen: unknown[] = [];
    const options = commonInitOptions({
      tenantTagHook: (event) => {
        seen.push(event);
        event.tags = { ...event.tags, organization_id: 'org_1' };
      },
    });

    const event = { message: 'boom' } as unknown as ErrorEvent;
    const out = options.beforeSend(event, {}) as unknown as { tags?: Obj };

    expect(seen).toHaveLength(1);
    expect(out?.tags?.['organization_id']).toBe('org_1');
  });

  it('runs the hook on the scrubbed transaction event', () => {
    const options = commonInitOptions({
      tenantTagHook: (event) => {
        event.tags = { ...event.tags, organization_id: 'org_2' };
      },
    });

    const event = { type: 'transaction', transaction: 'GET /x' } as unknown as TransactionEvent;
    const out = options.beforeSendTransaction(event, {}) as unknown as { tags?: Obj };

    expect(out?.tags?.['organization_id']).toBe('org_2');
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

// WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01: the root layout renders the
// account's server-stored consent onto <html> so a brand-new device's first
// paint doesn't depend on a localStorage mirror it has never written.
describe('readDocumentTelemetryConsent (server-rendered consent signal)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE);
  });

  it('reads true when the server rendered consent', () => {
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'true');
    expect(readDocumentTelemetryConsent()).toBe(true);
  });

  it('reads false when the server rendered no consent', () => {
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');
    expect(readDocumentTelemetryConsent()).toBe(false);
  });

  it('returns null when the attribute was never rendered', () => {
    expect(readDocumentTelemetryConsent()).toBeNull();
  });

  it('returns null rather than guessing on an unrecognized value', () => {
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'maybe');
    expect(readDocumentTelemetryConsent()).toBeNull();
  });
});

describe('shouldInitializeSentry (pre-mount init gate)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE);
    window.localStorage.clear();
  });

  it('never initializes when Sentry is unconfigured, regardless of consent', () => {
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'true');
    expect(isSentryConfigured()).toBe(false);
    expect(shouldInitializeSentry()).toBe(false);
  });

  describe('with Sentry configured', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://fixture@sentry.example/1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('initializes on a brand-new device when the server rendered consent true', () => {
      document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'true');
      expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBeNull();

      expect(shouldInitializeSentry()).toBe(true);
      expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('true');
    });

    it('stays off on a brand-new device when the server rendered no consent', () => {
      document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');
      expect(shouldInitializeSentry()).toBe(false);
      expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('false');
    });

    it('overrides a stale localStorage mirror with the fresh server signal', () => {
      setTelemetryConsentCache(true);
      document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');

      expect(shouldInitializeSentry()).toBe(false);
      expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('false');
    });

    it('falls back to the localStorage mirror when the document carries no signal', () => {
      setTelemetryConsentCache(true);

      expect(shouldInitializeSentry()).toBe(true);
    });

    it('fails closed when neither the document nor the mirror carries a signal', () => {
      expect(shouldInitializeSentry()).toBe(false);
    });
  });
});
