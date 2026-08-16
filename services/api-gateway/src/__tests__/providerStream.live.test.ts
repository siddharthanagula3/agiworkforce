
import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['ANTHROPIC_API_KEY'];
const skip = !liveEnabled || !apiKey;
const ANTHROPIC_CHAT_MODEL = requireProviderDefaultModel('anthropic');

describe.skipIf(skip)('provider stream route — anthropic e2e', () => {
  it('streams a tiny completion via /api/v1/providers/anthropic/stream', async () => {
    const express = (await import('express')).default;
    const supertest = (await import('supertest')).default;
    const { providerStreamRouter } = await import('../routes/providerStream');

    const app = express();
    app.use(express.json({ limit: '1mb' }));
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
        model: ANTHROPIC_CHAT_MODEL,
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
  it.skip('set AGIWORKFORCE_LIVE_TEST=1 + ANTHROPIC_API_KEY to run', () => {});
});
