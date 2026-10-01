import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { commonInitOptions } from '../sentry-shared';

type SdkEnvelope = Parameters<NonNullable<ReturnType<typeof Sentry.getClient>>['sendEnvelope']>[0];
const envelopes: SdkEnvelope[] = [];

function initialize() {
  return Sentry.init({
    ...commonInitOptions({ tracesSampleRate: 1 }),
    enableOpenTelemetrySetup: false,
    defaultIntegrations: [],
    transport: () => ({
      send(envelope: SdkEnvelope) {
        envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  });
}

let client: ReturnType<typeof initialize>;

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SENTRY_DSN', 'https://publickey@ingest.example.com/1');
  vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0');
  client = initialize();
  expect(client).toBeDefined();
});

beforeEach(() => {
  envelopes.length = 0;
});

afterAll(async () => {
  await Sentry.close();
  Sentry.getCurrentScope().setClient(undefined);
  vi.unstubAllEnvs();
});

describe('installed Sentry privacy options', () => {
  it('retains the explicit sampling decision over the SDK environment fallback', () => {
    expect(client!.getOptions().tracesSampleRate).toBe(1);
  });

  it('disables every automatic content collection category in the SDK itself', () => {
    expect(client!.getOptions().dataCollection).toMatchObject({
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

  it('runs the transaction and static span scrubbers on actual SDK envelopes', async () => {
    Sentry.startSpan({ name: 'GET /oauth/callback?code=private-query-value' }, () => {
      Sentry.startSpan(
        {
          name: 'GET https://provider.example.com/token?code=private-child-value',
          attributes: { 'url.full': 'https://provider.example.com/token?code=private-child-value' },
        },
        () => undefined,
      );
    });
    await expect(client!.flush()).resolves.toBe(true);
    const items = envelopes.flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1]);
    const transactions = items.filter(([header]) => header.type === 'transaction');
    expect(transactions).toHaveLength(1);
    expect(JSON.stringify(transactions)).not.toContain('private-query-value');
    expect(JSON.stringify(transactions)).not.toContain('private-child-value');
    expect(JSON.stringify(transactions)).toContain('/oauth/callback');
    expect(JSON.stringify(transactions)).toContain('provider.example.com/token');
  });
});
