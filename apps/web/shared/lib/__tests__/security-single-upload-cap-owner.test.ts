import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SecurityManager } from '../security';

const source = readFileSync(resolve(import.meta.dirname, '../security.ts'), 'utf8');

describe('SecurityManager is not a second attachment-cap owner', () => {
  it('exposes no upload validator', () => {
    expect(
      (SecurityManager as unknown as Record<string, unknown>)['validateFileUpload'],
    ).toBeUndefined();
  });

  it('does not read the chat attachment cap', () => {
    expect(source).not.toContain('MAX_CHAT_ATTACHMENT_BYTES');
    expect(source).not.toMatch(/\d+\s*\*\s*1024\s*\*\s*1024/);
  });
});
