import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OTEL_ENDPOINT_ENV,
  OTEL_HEADERS_ENV,
  OTEL_SAMPLE_RATIO_ENV,
} from '@/lib/observability/otel-config';
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE,
  TELEMETRY_CONSENT_STORAGE_KEY,
} from '@/lib/sentry-shared';

const sentryInit = vi.fn();
const validateOpenTelemetrySetup = vi.fn();
const startOtelSdk = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => sentryInit(...args) as unknown,
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  validateOpenTelemetrySetup: (...args: unknown[]) =>
    validateOpenTelemetrySetup(...args) as unknown,
}));

vi.mock('botid/client/core', () => ({
  initBotId: () => undefined,
}));

vi.mock('@/lib/validate-env', () => ({
  validateEnvironment: () => ({ valid: true, errors: [] }),
  logValidationResults: () => undefined,
}));

vi.mock('@/lib/server/db-pool-tuning', () => ({
  assertPooledDatabaseEndpoint: () => undefined,
}));

vi.mock('@/lib/observability/otel-sdk', () => ({
  startOtelSdk: (...args: unknown[]) => startOtelSdk(...args) as unknown,
}));

const COLLECTOR = 'https://collector.example.com';
const SENTRY_DSN = 'https://publickey@o0.ingest.example.com/1';

function sentryOptions(): Record<string, unknown> {
  return (sentryInit.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
}

async function runRegister(): Promise<void> {
  vi.resetModules();
  const instrumentation = await import('@/instrumentation');
  await instrumentation.register();
}

beforeEach(() => {
  sentryInit.mockReset();
  sentryInit.mockReturnValue({});
  validateOpenTelemetrySetup.mockReset();
  startOtelSdk.mockReset();
  startOtelSdk.mockReturnValue({ shutdown: () => Promise.resolve() });
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('register with no exporter endpoint configured', () => {
  it('never starts the OpenTelemetry SDK', async () => {
    await runRegister();
    expect(startOtelSdk).not.toHaveBeenCalled();
  });

  it('leaves the Sentry setup exactly as it was', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', SENTRY_DSN);

    await runRegister();

    expect(startOtelSdk).not.toHaveBeenCalled();
    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryOptions()['skipOpenTelemetrySetup']).toBeUndefined();
    expect(sentryOptions()['tracesSampleRate']).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });
});

describe('register with an exporter endpoint configured', () => {
  it('starts the SDK alone when Sentry is not configured', async () => {
    vi.stubEnv(OTEL_ENDPOINT_ENV, COLLECTOR);
    vi.stubEnv(OTEL_HEADERS_ENV, 'x-api-key=abc123');

    await runRegister();

    expect(sentryInit).not.toHaveBeenCalled();
    expect(startOtelSdk).toHaveBeenCalledTimes(1);
    const [config, client] = startOtelSdk.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(config['tracesEndpoint']).toBe(`${COLLECTOR}/v1/traces`);
    expect(config['headers']).toEqual({ 'x-api-key': 'abc123' });
    expect(client).toBeUndefined();
  });

  it('hands the Sentry client to the SDK and stops Sentry owning the provider', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', SENTRY_DSN);
    vi.stubEnv(OTEL_ENDPOINT_ENV, COLLECTOR);

    await runRegister();

    expect(sentryOptions()['skipOpenTelemetrySetup']).toBe(true);
    expect(startOtelSdk.mock.calls[0]?.[1]).toEqual({});
    expect(validateOpenTelemetrySetup).toHaveBeenCalledTimes(1);
  });

  it('lets one sample ratio govern both pipelines when both run', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', SENTRY_DSN);
    vi.stubEnv(OTEL_ENDPOINT_ENV, COLLECTOR);
    vi.stubEnv(OTEL_SAMPLE_RATIO_ENV, '0.25');

    await runRegister();

    expect(sentryOptions()['tracesSampleRate']).toBe(0.25);
  });

  it('keeps the existing Sentry rate when no ratio is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', SENTRY_DSN);
    vi.stubEnv(OTEL_ENDPOINT_ENV, COLLECTOR);

    await runRegister();

    expect(sentryOptions()['tracesSampleRate']).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });

  it('never starts the node SDK on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv(OTEL_ENDPOINT_ENV, COLLECTOR);

    await runRegister();

    expect(startOtelSdk).not.toHaveBeenCalled();
  });
});

describe('client telemetry consent gate', () => {
  async function loadClientInstrumentation(): Promise<void> {
    vi.resetModules();
    await import('@/instrumentation-client');
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', SENTRY_DSN);
    window.localStorage.clear();
    document.documentElement.removeAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE);
  });

  it('does not initialise Sentry in the browser without consent', async () => {
    await loadClientInstrumentation();
    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('initialises Sentry once consent is recorded, without taking over OpenTelemetry', async () => {
    window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, 'true');
    await loadClientInstrumentation();
    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryOptions()['skipOpenTelemetrySetup']).toBeUndefined();
  });

  it('lets a revoked document consent flag override a stale cache', async () => {
    window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, 'true');
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');
    await loadClientInstrumentation();
    expect(sentryInit).not.toHaveBeenCalled();
  });
});
