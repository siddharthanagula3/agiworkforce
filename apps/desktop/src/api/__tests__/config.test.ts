import { describe, expect, it } from 'vitest';

import { API_BASE_URL, WEB_APP_URL } from '../config';

describe('Desktop Cloud production origins', () => {
  it('uses one canonical origin so bearer requests do not cross a redirect', () => {
    expect(API_BASE_URL).toBe('https://agiworkforce.com');
    expect(WEB_APP_URL).toBe('https://agiworkforce.com');
  });
});
