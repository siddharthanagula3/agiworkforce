import { describe, expect, it } from 'vitest';

import { normalizeDiagnostics } from '../schema';
import { MAX_DIAGNOSTIC_EVENTS, MAX_DIAGNOSTIC_MESSAGE_CHARS, describeDiagnostics } from '../types';

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    collectedAt: '2026-09-17T10:00:00.000Z',
    surface: 'web',
    appVersion: '1.2.3',
    releaseSha: 'abc1234',
    deployEnv: 'production',
    platform: 'Mozilla/5.0',
    locale: 'en-GB',
    timeZone: 'Europe/London',
    viewport: { width: 1440, height: 900 },
    online: true,
    pagePath: '/settings/billing',
    conversationId: null,
    recentEvents: [],
    ...overrides,
  };
}

describe('normalizeDiagnostics', () => {
  it('accepts a well-formed bundle unchanged', () => {
    const result = normalizeDiagnostics(bundle());
    expect(result?.surface).toBe('web');
    expect(result?.viewport).toEqual({ width: 1440, height: 900 });
  });

  it('rejects an unknown surface rather than storing it', () => {
    expect(normalizeDiagnostics(bundle({ surface: 'toaster' }))).toBeNull();
  });

  it('rejects an unknown field rather than passing it through to storage', () => {
    expect(normalizeDiagnostics(bundle({ sessionToken: 'sk_live_whatever' }))).toBeNull();
  });

  /**
   * A path can carry a share token or whatever the user pasted into the address
   * bar. Only the path is support context; the rest is not.
   */
  it('drops the query string and fragment from the page path', () => {
    const result = normalizeDiagnostics(
      bundle({ pagePath: '/share/abc?token=secret-value#section' }),
    );
    expect(result?.pagePath).toBe('/share/abc');
  });

  it('keeps only the most recent events, so an error loop cannot fill the bundle', () => {
    const events = Array.from({ length: MAX_DIAGNOSTIC_EVENTS * 3 }, (_unused, index) => ({
      at: '2026-09-17T10:00:00.000Z',
      kind: 'error' as const,
      message: `failure ${index}`,
    }));

    const result = normalizeDiagnostics(bundle({ recentEvents: events }));

    expect(result?.recentEvents).toHaveLength(MAX_DIAGNOSTIC_EVENTS);
    expect(result?.recentEvents.at(-1)?.message).toBe(`failure ${events.length - 1}`);
  });

  it('redacts a credential a client put in an event message', () => {
    const result = normalizeDiagnostics(
      bundle({
        recentEvents: [
          {
            at: '2026-09-17T10:00:00.000Z',
            kind: 'request_failed',
            message: 'POST /v1/chat failed with Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
          },
        ],
      }),
    );

    expect(result?.recentEvents[0]?.message).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result?.recentEvents[0]?.message).toMatch(/\[redacted/u);
  });

  it('redacts an address the leak-detector patterns alone would leave in place', () => {
    const result = normalizeDiagnostics(
      bundle({
        recentEvents: [
          {
            at: '2026-09-17T10:00:00.000Z',
            kind: 'error',
            message: 'sync failed for owner@example.com',
          },
        ],
      }),
    );

    expect(result?.recentEvents[0]?.message).not.toContain('owner@example.com');
  });

  it('truncates an oversized event message instead of refusing the bundle', () => {
    const result = normalizeDiagnostics(
      bundle({
        recentEvents: [
          { at: '2026-09-17T10:00:00.000Z', kind: 'error', message: 'x'.repeat(1_500) },
        ],
      }),
    );

    expect(result).not.toBeNull();
    expect(result!.recentEvents[0]!.message.length).toBeLessThanOrEqual(
      MAX_DIAGNOSTIC_MESSAGE_CHARS + 20,
    );
  });
});

describe('describeDiagnostics', () => {
  it('names every field a support reply would otherwise have to ask for', () => {
    const rendered = describeDiagnostics(normalizeDiagnostics(bundle())!);

    for (const expected of [
      'surface: web',
      'app version: 1.2.3',
      'release: abc1234',
      'environment: production',
      'locale: en-GB',
      'time zone: Europe/London',
      'viewport: 1440x900',
      'page: /settings/billing',
    ]) {
      expect(rendered).toContain(expected);
    }
  });

  it('says unknown rather than leaving a field blank', () => {
    const rendered = describeDiagnostics(
      normalizeDiagnostics(bundle({ appVersion: null, viewport: null }))!,
    );
    expect(rendered).toContain('app version: unknown');
    expect(rendered).toContain('viewport: unknown');
  });
});
