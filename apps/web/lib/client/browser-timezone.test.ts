import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBrowserTimeZone } from './browser-timezone';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getBrowserTimeZone', () => {
  it('returns the browser-resolved IANA time zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/Chicago' }),
    } as Intl.DateTimeFormat);

    expect(getBrowserTimeZone()).toBe('America/Chicago');
  });

  it('fails closed when the runtime cannot resolve a time zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable');
    });

    expect(getBrowserTimeZone()).toBeUndefined();
  });
});
