import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { makeFetchTransport } from '@sentry/nextjs';

type Transport = ReturnType<typeof makeFetchTransport>;
type Envelope = Parameters<Transport['send']>[0];
type TransportOptions = Parameters<typeof makeFetchTransport>[0];

const mocks = vi.hoisted(() => ({
  makeFetchTransport: vi.fn(),
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

// The factory is mocked: these fixtures exercise our boundary, not browser SDK resolution.
vi.mock('@sentry/nextjs', async () => ({
  ...(await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs')),
  makeFetchTransport: mocks.makeFetchTransport,
  init: mocks.init,
  captureRouterTransitionStart: mocks.captureRouterTransitionStart,
}));
vi.mock('botid/client/core', () => ({ initBotId: vi.fn() }));

let consent: typeof import('@/lib/sentry-shared');
let subject: typeof import('./sentry-client-options');
let send: ReturnType<typeof vi.fn<Transport['send']>>;
let flush: ReturnType<typeof vi.fn<Transport['flush']>>;
const options: TransportOptions = {
  url: 'https://telemetry.invalid/envelope/',
  recordDroppedEvent: vi.fn(),
};
const event: Envelope = [
  { event_id: 'fixture', sent_at: '2026-11-05T00:00:00Z' },
  [[{ type: 'event' }, { message: 'fixture' }]],
];

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-telemetry-consent');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@telemetry.invalid/1');
  vi.stubEnv('NEXT_PUBLIC_AGI_BOT_PROTECTION', 'off');
  consent = await import('@/lib/sentry-shared');
  subject = await import('./sentry-client-options');
  send = vi.fn<Transport['send']>(() => Promise.resolve({ statusCode: 200 }));
  flush = vi.fn<Transport['flush']>(() => Promise.resolve(true));
  mocks.makeFetchTransport.mockReturnValue({ send, flush });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-telemetry-consent');
});

describe('configured browser transport consent boundary with a mocked fetch factory', () => {
  it('forwards synchronously with the original envelope and promise', () => {
    consent.confirmTelemetryConsent(true);
    const response = Promise.resolve({ statusCode: 202 });
    send.mockReturnValue(response);
    const transport = subject.makeConsentAwareSentryTransport(options);

    expect(mocks.makeFetchTransport).toHaveBeenCalledExactlyOnceWith(options);
    expect(transport.send(event)).toBe(response);
    expect(send).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('rechecks live consent on the same transport after a previously admitted send', async () => {
    consent.confirmTelemetryConsent(true);
    const transport = subject.makeConsentAwareSentryTransport(options);
    await transport.send(event);
    consent.requestTelemetryOptOut();

    expect(await transport.send(event)).toEqual({});
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    'event',
    'transaction',
    'span',
    'session',
    'sessions',
    'client_report',
    'attachment',
    'user_report',
    'feedback',
    'profile',
    'profile_chunk',
    'replay_event',
    'replay_recording',
    'check_in',
    'log',
    'metric',
    'trace_metric',
    'raw_security',
  ])('denies opaque %s envelopes without interpreting their payload', async (type) => {
    // Payload validity belongs to the SDK; the gate must not inspect or whitelist categories.
    const envelope = [{}, [[{ type }, {}]]] as unknown as Envelope;
    const transport = subject.makeConsentAwareSentryTransport(options);

    expect(await transport.send(envelope)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('denies mixed envelopes and does not replay them on flush or renewed consent', async () => {
    const mixed = [
      {},
      [
        [{ type: 'event' }, {}],
        [{ type: 'span' }, {}],
      ],
    ] as unknown as Envelope;
    const transport = subject.makeConsentAwareSentryTransport(options);
    expect(await transport.send(mixed)).toEqual({});
    await transport.flush(20);
    consent.confirmTelemetryConsent(true);
    await transport.flush(30);
    expect(send).not.toHaveBeenCalled();

    await transport.send(event);
    expect(send).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('delegates flush timeout and result after revocation without claiming cancellation', () => {
    consent.confirmTelemetryConsent(true);
    const transport = subject.makeConsentAwareSentryTransport(options);
    const admitted = Promise.resolve({ statusCode: 200 });
    send.mockReturnValue(admitted);
    expect(transport.send(event)).toBe(admitted);
    consent.requestTelemetryOptOut();
    const draining = Promise.resolve(false);
    flush.mockReturnValue(draining);

    expect(transport.flush(123)).toBe(draining);
    expect(flush).toHaveBeenCalledExactlyOnceWith(123);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('denies when opt-out writes fail while the old opt-in remains readable', async () => {
    consent.confirmTelemetryConsent(true);
    const transport = subject.makeConsentAwareSentryTransport(options);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage write refused');
    });
    consent.requestTelemetryOptOut();

    expect(window.localStorage.getItem(consent.TELEMETRY_CONSENT_STORAGE_KEY)).toBe('true');
    expect(await transport.send(event)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('denies when storage reads throw even after a prior opt-in', async () => {
    consent.confirmTelemetryConsent(true);
    const transport = subject.makeConsentAwareSentryTransport(options);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage read refused');
    });

    expect(await transport.send(event)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('denies when localStorage is absent', async () => {
    const transport = subject.makeConsentAwareSentryTransport(options);
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(undefined as unknown as Storage);

    expect(await transport.send(event)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });

  it('denies outside a browser', async () => {
    const transport = subject.makeConsentAwareSentryTransport(options);
    vi.stubGlobal('window', undefined);

    expect(await transport.send(event)).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });
});

describe('browser initialization wiring with mocked SDK entrypoints', () => {
  it('retains common configuration and scrubbers while adding only the transport', () => {
    const expected = consent.commonInitOptions();
    vi.spyOn(consent, 'commonInitOptions').mockReturnValue(expected);
    const { transport, ...shared } = subject.clientSentryInitOptions();

    expect(shared).toEqual(expected);
    expect(shared.beforeSendSpan).toBe(expected.beforeSendSpan);
    expect(transport).toBe(subject.makeConsentAwareSentryTransport);
  });

  it.each(['startup', 'after-consent'])(
    'keeps %s initialization closed without consent',
    async (entry) => {
      if (entry === 'startup') {
        await import('../../instrumentation-client');
      } else {
        const { initializeSentryAfterConsent } = await import('./initialize-sentry-after-consent');
        initializeSentryAfterConsent();
      }
      expect(mocks.init).not.toHaveBeenCalled();
    },
  );

  it.each(['startup', 'after-consent'])(
    'wires %s initialization to live transport consent',
    async (entry) => {
      consent.confirmTelemetryConsent(true);
      if (entry === 'startup') {
        await import('../../instrumentation-client');
      } else {
        const { initializeSentryAfterConsent } = await import('./initialize-sentry-after-consent');
        initializeSentryAfterConsent();
      }
      expect(mocks.init).toHaveBeenCalledOnce();
      const initialized = mocks.init.mock.calls[0]?.[0] as ReturnType<
        typeof subject.clientSentryInitOptions
      >;
      expect(initialized.transport).toBe(subject.makeConsentAwareSentryTransport);
      expect(initialized.beforeSend).toBe(consent.scrubEvent);
      expect(initialized.beforeSendTransaction).toBe(consent.scrubTransactionEvent);
      expect(initialized.beforeBreadcrumb).toBe(consent.scrubBreadcrumb);
      const transport = initialized.transport(options);
      consent.requestTelemetryOptOut();
      expect(await transport.send(event)).toEqual({});
      expect(send).not.toHaveBeenCalled();
    },
  );
});
