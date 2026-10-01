// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import * as Sentry from '@sentry/nextjs';

import { commonInitOptions } from '../sentry-shared';
import { resolveOtelExportConfig } from './otel-config';
import { startOtelSdk } from './otel-sdk';

type SdkEnvelope = Parameters<NonNullable<ReturnType<typeof Sentry.getClient>>['sendEnvelope']>[0];

afterAll(async () => {
  await Sentry.close();
});

describe('installed Sentry automatic instrumentation', () => {
  it('forwards a real HTTP operation without tracing its own collector or Sentry exporter requests', async () => {
    const http = await import('node:http');
    const bodies: { path: string; payload: string }[] = [];
    const envelopes: SdkEnvelope[] = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        bodies.push({ path: request.url!, payload: Buffer.concat(chunks).toString() });
        response.setHeader('content-type', 'application/json');
        response.end('{}');
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Owned collector unavailable');
    const endpoint = `http://127.0.0.1:${address.port}`;
    const client = Sentry.init({
      ...commonInitOptions({ tracesSampleRate: 1, enableOpenTelemetrySetup: true }),
      dsn: `${endpoint.replace('://', '://publickey@')}/1`,
      enabled: true,
      transport: () => ({
        send(envelope: SdkEnvelope) {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    expect(client).toBeDefined();
    const tracing = startOtelSdk(
      resolveOtelExportConfig({ AGI_OTEL_EXPORTER_ENDPOINT: endpoint })!,
      client,
    );
    try {
      await Sentry.startSpan({ name: 'native-http-owner' }, async () => {
        await new Promise<void>((resolve, reject) => {
          const request = http.get(
            `${endpoint}/synthetic-operation?code=private-query`,
            (response) => {
              response.resume();
              response.once('end', resolve);
            },
          );
          request.once('error', reject);
        });
      });
      await tracing.shutdown();
      await expect(client!.flush()).resolves.toBe(true);
      expect(bodies.filter((body) => body.path.startsWith('/synthetic-operation'))).toHaveLength(1);
      const exported = bodies
        .filter((body) => body.path === '/v1/traces')
        .flatMap((body) => JSON.parse(body.payload).resourceSpans)
        .flatMap((resource) => resource.scopeSpans)
        .flatMap((scope) => scope.spans) as {
        spanId: string;
        parentSpanId?: string;
        name: string;
        attributes: unknown[];
      }[];
      const transactions = envelopes
        .flatMap<SdkEnvelope[1][number]>((envelope) => envelope[1])
        .filter(([header]) => header.type === 'transaction');
      expect(transactions.length).toBeGreaterThan(0);
      expect(exported.length).toBeGreaterThan(1);
      expect(new Set(exported.map((span) => span.spanId)).size).toBe(exported.length);
      expect(JSON.stringify(exported)).not.toContain('private-query');
      expect(JSON.stringify(exported)).not.toContain('/v1/traces');
      expect(JSON.stringify(exported)).not.toContain('/integration/otlp/');
      const nativeIds = JSON.stringify(transactions);
      for (const span of exported) expect(nativeIds).toContain(span.spanId);
    } finally {
      await tracing.shutdown().catch(() => undefined);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
