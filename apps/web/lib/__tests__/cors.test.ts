import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('isOriginAllowed', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['ALLOWED_ORIGINS'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
  });

  it('allows requests without Origin header by default', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed(null)).toBe(true);
  });

  it('rejects missing Origin when requireOrigin is true', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed(null, true)).toBe(false);
  });

  it('allows Tauri origin tauri://localhost', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('tauri://localhost')).toBe(true);
  });

  it('rejects arbitrary origins without ALLOWED_ORIGINS', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://evil.com')).toBe(false);
  });

  it('allows origins from ALLOWED_ORIGINS env var', async () => {
    process.env['ALLOWED_ORIGINS'] = 'https://myapp.com,https://staging.myapp.com';
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://myapp.com')).toBe(true);
    expect(isOriginAllowed('https://staging.myapp.com')).toBe(true);
    expect(isOriginAllowed('https://other.com')).toBe(false);
  });

  it('allows NEXT_PUBLIC_APP_URL as origin', async () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.agiworkforce.com';
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://app.agiworkforce.com')).toBe(true);
  });
});
