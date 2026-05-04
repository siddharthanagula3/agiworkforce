/**
 * In-process e2e for the provider stream route.
 *
 * Boots the express app under supertest, hits
 * `POST /api/v1/providers/anthropic/stream`, and asserts the SSE response
 * yields a non-empty assembled text + a non-error stop. Gated on
 * AGIWORKFORCE_LIVE_TEST=1 + ANTHROPIC_API_KEY (real network).
 *
 * This is the gateway-level analog of the per-adapter live tests: it proves
 * that the route, auth middleware, validation, and SSE plumbing all work
 * together, not just the underlying adapter.
 *
 * NOTE: in this PR we only build the test scaffold (skip path) — fully
 * exercising it requires standing up an Express app instance with a mocked
 * authenticateToken middleware. The skip path runs in CI clean.
 */

import { describe, expect, it } from 'vitest';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['ANTHROPIC_API_KEY'];
const skip = !liveEnabled || !apiKey;

describe.skipIf(skip)('provider stream route — anthropic e2e', () => {
  it('streams a tiny completion via /api/v1/providers/anthropic/stream', async () => {
    // Lazy import so the suite skip path doesn't pull in the gateway tree.
    // We construct a fresh express app with the providerStream router mounted
    // and a stubbed auth middleware so the test doesn't depend on a real JWT.
    const express = (await import('express')).default;
    const supertest = (await import('supertest')).default;
    const { providerStreamRouter } = await import('../routes/providerStream');

    const app = express();
    app.use(express.json({ limit: '1mb' }));
    // Stub auth middleware: provider stream router calls authenticateToken
    // first; we shortcut by injecting a user on every request.
    app.use((req, _res, next) => {
      (req as unknown as { user: { userId: string } }).user = { userId: 'live-test' };
      next();
    });
    app.use('/api/v1/providers', providerStreamRouter);

    const res = await supertest(app)
      .post('/api/v1/providers/anthropic/stream')
      .set('authorization', 'Bearer live-test')
      .set('x-requested-with', 'live-test')
      .send({
        model: 'claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        maxOutputTokens: 32,
      })
      .buffer(true)
      .parse((response, done) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf-8');
        });
        response.on('end', () => done(null, body));
      });

    expect(res.status).toBe(200);
    const sseBody = res.body as unknown as string;
    expect(typeof sseBody).toBe('string');

    // Parse SSE frames into chunks.
    const chunks: Array<{ type: string; [k: string]: unknown }> = [];
    for (const frame of sseBody.split('\n\n')) {
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        chunks.push(JSON.parse(data));
      } catch {
        // skip malformed
      }
    }

    const text = chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => (c as unknown as { delta: string }).delta)
      .join('');
    const stop = chunks.find((c) => c.type === 'stop');
    const errors = chunks.filter((c) => c.type === 'error');

    expect(errors).toHaveLength(0);
    expect(text.length).toBeGreaterThan(0);
    expect(stop).toBeDefined();
    expect((stop as { reason?: string } | undefined)?.reason).not.toBe('error');
  }, 60_000);
});

describe.skipIf(!skip)('provider stream route — anthropic e2e (skipped)', () => {
  it('skipped — set AGIWORKFORCE_LIVE_TEST=1 + ANTHROPIC_API_KEY to run', () => {
    expect(true).toBe(true);
  });
});
