import { get } from 'node:http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/server';

describe('Gateway process lifecycle', () => {
  it('marks readiness false and force-closes an active request at the deadline', async () => {
    const app = express();
    app.get('/hang', (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('partial');
    });
    const dispose = vi.fn(async () => undefined);
    const runtime = createGatewayRuntime({
      app,
      host: '127.0.0.1',
      port: 0,
      shutdownGraceMs: 25,
      setupWebSocketHandlers: false,
      dispose,
    });

    expect(runtime.isAcceptingTraffic()).toBe(false);
    await runtime.start();
    expect(runtime.isAcceptingTraffic()).toBe(true);

    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');

    const responseStarted = new Promise<void>((resolve, reject) => {
      const request = get(`http://127.0.0.1:${address.port}/hang`, (response) => {
        response.once('data', () => resolve());
        response.on('error', () => undefined);
      });
      request.on('error', reject);
    });
    await responseStarted;

    const startedAt = Date.now();
    const firstShutdown = runtime.shutdown('SIGTERM');
    const secondShutdown = runtime.shutdown('SIGINT');

    expect(runtime.isAcceptingTraffic()).toBe(false);
    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(dispose).toHaveBeenCalledOnce();
    expect(runtime.server.listening).toBe(false);
  });
});
