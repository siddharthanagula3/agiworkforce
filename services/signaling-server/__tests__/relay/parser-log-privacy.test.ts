import { Writable } from 'node:stream';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeStore, startInProcessRelay, type InProcessRelay } from './in-process.js';

vi.unmock('../../src/logger.js');
const { buildLogger, logger } = await import('../../src/logger.js');
let relay: InProcessRelay;

beforeAll(async () => {
  relay = await startInProcessRelay(new FakeStore());
});

describe('HTTP parser log privacy', () => {
  it('does not log malformed request content through the JSON parser error', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const captured = buildLogger(stream, 'debug');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(captured.error.bind(captured));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(captured.warn.bind(captured));
    const sentinel = 'Bearer fixture';
    try {
      const response = await fetch(`${relay.http}/pairings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: sentinel,
      });
      await response.text();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('')).not.toContain(sentinel);
      expect(response.status).toBe(400);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
