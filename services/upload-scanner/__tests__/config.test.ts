import { describe, expect, it } from 'vitest';

import { MIN_TOKEN_LENGTH, loadConfig } from '../src/config.ts';

const TOKEN = 'a'.repeat(MIN_TOKEN_LENGTH);
const PREVIOUS_TOKEN = 'b'.repeat(MIN_TOKEN_LENGTH);

describe('loadConfig', () => {
  it('refuses to start without a token, so no request is ever served unauthenticated', () => {
    expect(() => loadConfig({})).toThrow(/UPLOAD_SCAN_WEBHOOK_TOKEN/);
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: '   ' })).toThrow(
      /UPLOAD_SCAN_WEBHOOK_TOKEN/,
    );
  });

  it('refuses a token shorter than the minimum, including the one being rotated out', () => {
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN.slice(1) })).toThrow();
    expect(() =>
      loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS: 'short' }),
    ).toThrow();
  });

  it('accepts the current token and the one being rotated out', () => {
    expect(
      loadConfig({
        UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN,
        UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS: PREVIOUS_TOKEN,
      }),
    ).toEqual({ tokens: [TOKEN, PREVIOUS_TOKEN], port: 8080 });
  });

  it('listens on PORT and refuses a value that is not a port', () => {
    expect(loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, PORT: '9000' }).port).toBe(9000);
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, PORT: 'http' })).toThrow(/PORT/);
  });
});
