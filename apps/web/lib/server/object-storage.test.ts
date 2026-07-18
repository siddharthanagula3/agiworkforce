import { afterEach, describe, expect, it } from 'vitest';
import { objectKeyFromPublicUrl } from './object-storage';

const ORIGINAL_BASE_URL = process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'];

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) delete process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'];
  else process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = ORIGINAL_BASE_URL;
});

describe('objectKeyFromPublicUrl', () => {
  it('returns the exact object key under the configured public base', () => {
    process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://files.example.test/assets';

    expect(
      objectKeyFromPublicUrl(
        'https://files.example.test/assets/knowledge-files/projects/project-1/object.txt',
      ),
    ).toBe('knowledge-files/projects/project-1/object.txt');
  });

  it('rejects lookalike origins, credentials, queries, fragments, and traversal', () => {
    process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://files.example.test/assets';

    for (const value of [
      'https://files.example.test.evil/assets/knowledge-files/file.txt',
      'https://user@files.example.test/assets/knowledge-files/file.txt',
      'https://files.example.test/assets/knowledge-files/file.txt?download=1',
      'https://files.example.test/assets/knowledge-files/file.txt#fragment',
      'https://files.example.test/assets/knowledge-files/%2e%2e/file.txt',
      'https://files.example.test/assets/knowledge-files\\..\\file.txt',
    ]) {
      expect(objectKeyFromPublicUrl(value), value).toBeNull();
    }
  });
});
