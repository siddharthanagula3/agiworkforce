import { describe, expect, it } from 'vitest';
import { findLocalPreviewUrl, localPreviewUrl } from '../apps';

describe('the address a preview may open', () => {
  it('opens only pages served on this computer', () => {
    expect(localPreviewUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(localPreviewUrl('http://127.0.0.1:3000/app?x=1')).toBe('http://127.0.0.1:3000/app?x=1');
    expect(localPreviewUrl('http://[::1]:8080')).toBe('http://[::1]:8080/');
    expect(localPreviewUrl('http://0.0.0.0:4321/')).toBe('http://localhost:4321/');
    for (const refused of [
      'https://agiworkforce.com',
      'http://localhost.evil.com:3000',
      'http://user:pass@localhost:3000',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://192.168.1.4:3000',
      42,
    ]) {
      expect(localPreviewUrl(refused), String(refused)).toBeNull();
    }
  });

  it('finds the last address a dev server printed, through its colour codes', () => {
    const vite =
      '\u001b[32m  VITE v6.0.0  ready\u001b[39m\n  ➜  Local:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m\n';
    expect(findLocalPreviewUrl(vite)).toBe('http://localhost:5173/');
    expect(
      findLocalPreviewUrl('Listening on http://0.0.0.0:3000\nRestarted on http://127.0.0.1:3001.'),
    ).toBe('http://127.0.0.1:3001/');
    expect(findLocalPreviewUrl('see https://example.com and nothing local')).toBeNull();
  });
});
