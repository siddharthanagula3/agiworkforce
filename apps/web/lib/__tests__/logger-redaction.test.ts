import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { loggerOptions } from '../logger';

function captureLines(emit: (log: pino.Logger) => void): string[] {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const { transport: _transport, ...options } = loggerOptions;
  emit(pino({ ...options, level: 'debug' }, stream));
  return lines;
}

describe('web pino logger redaction', () => {
  it('masks emails and secret-shaped values in the merging object', () => {
    const [line] = captureLines((log) => {
      log.info(
        { email: 'person@example.com', apiKey: 'sk_test_FAKEFAKEFAKE0000', requestId: 'r1' },
        'created account',
      );
    });
    expect(line).toBeDefined();
    const record = JSON.parse(line as string) as Record<string, unknown>;
    expect(record['email']).toBe('[redacted]');
    expect(record['apiKey']).toBe('[redacted]');
    expect(record['requestId']).toBe('r1');
    expect(line).not.toContain('person@example.com');
    expect(line).not.toContain('FAKEFAKEFAKE0000');
  });

  it('masks emails and secret-shaped values embedded in the message string', () => {
    const [line] = captureLines((log) => {
      log.error('share failed for person@example.com using sk_live_FAKEFAKEFAKE0001');
    });
    expect(line).toBeDefined();
    const record = JSON.parse(line as string) as Record<string, unknown>;
    expect(record['msg']).toBe('share failed for [redacted] using [redacted]');
  });

  it('masks nested error messages and stacks carried on a log record', () => {
    const [line] = captureLines((log) => {
      log.warn({ err: new Error('upstream said person@example.com is unknown') }, 'lookup failed');
    });
    expect(line).toBeDefined();
    const record = JSON.parse(line as string) as { err: { message: string } };
    expect(record.err.message).toBe('upstream said [redacted] is unknown');
  });
});
