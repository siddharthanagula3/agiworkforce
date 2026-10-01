import * as Sentry from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SdkEnvelope = Parameters<NonNullable<ReturnType<typeof Sentry.getClient>>['sendEnvelope']>[0];

const fixture = vi.hoisted(() => ({
  envelopes: [] as unknown[],
  privacyMode: vi.fn(() => 'managed' as string),
}));

type SentryModule = typeof import('@sentry/react');
type AppModeModule = typeof import('../../stores/appModeStore');

vi.mock('@sentry/react', async (importOriginal) => {
  const actual = await importOriginal<SentryModule>();
  return {
    ...actual,
    init: (options: Parameters<typeof actual.init>[0]) =>
      actual.init({
        ...options,
        defaultIntegrations: [],
        integrations: [],
        transport: () => ({
          send(envelope: SdkEnvelope) {
            fixture.envelopes.push(envelope);
            return Promise.resolve({ statusCode: 200 });
          },
          flush: () => Promise.resolve(true),
        }),
      }),
  };
});
vi.mock('../analytics', () => ({
  analytics: { track: vi.fn() },
  AnalyticsService: vi.fn(),
}));
vi.mock('../../stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppModeModule>();
  return {
    ...actual,
    useAppModeStore: { getState: () => ({}) },
    selectPrivacyMode: () => fixture.privacyMode(),
  };
});

import { ErrorTrackingService } from '../errorTracking';

function initialize() {
  const service = new ErrorTrackingService();
  service.updateConfig({ enabled: true, tracesSampleRate: 1 });
  const client = Sentry.getClient();
  expect(client).toBeDefined();
  return client!;
}

function traceItems() {
  return (fixture.envelopes as SdkEnvelope[])
    .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
    .filter(([header]) => header.type === 'transaction' || header.type === 'span');
}

beforeEach(() => {
  localStorage.clear();
  fixture.envelopes.length = 0;
  fixture.privacyMode.mockReturnValue('managed');
  vi.stubEnv('VITE_SENTRY_DSN', 'https://publickey@ingest.example.com/1');
});

afterEach(async () => {
  await Sentry.close();
  Sentry.getCurrentScope().setClient(undefined);
  vi.unstubAllEnvs();
});

describe('installed desktop Sentry boundary', () => {
  it('keeps SDK automatic content collection disabled by default', () => {
    const client = initialize();
    expect(client.getOptions().dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
    });
  });

  it('sends a managed trace but refuses traces when the boundary changes before completion', async () => {
    const client = initialize();
    Sentry.startSpan({ name: 'managed-control', forceTransaction: true }, () => undefined);
    await expect(client.flush()).resolves.toBe(true);
    expect(traceItems()).toHaveLength(1);
    fixture.envelopes.length = 0;

    for (const mode of ['local', 'byok']) {
      fixture.privacyMode.mockReturnValue('managed');
      const span = Sentry.startInactiveSpan({ name: 'private-boundary', forceTransaction: true });
      expect(span.isRecording()).toBe(true);
      fixture.privacyMode.mockReturnValue(mode);
      span.end();
      await expect(client.flush()).resolves.toBe(true);
      expect(traceItems()).toHaveLength(0);
    }
  });
});
