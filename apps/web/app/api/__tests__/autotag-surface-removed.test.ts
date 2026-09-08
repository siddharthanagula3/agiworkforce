import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');

/**
 * The autotag routes classified a conversation into a topic and stored it in
 * `conversation_tags`. Nothing on the web app ever called them, and the only
 * caller anywhere, `apps/mobile/services/autotag.ts`, is itself imported by
 * nothing, so no screen on any surface ever showed a tag. Three routes that
 * spend a model call and write a row for a feature the product does not have
 * are a liability, not an asset.
 */
describe('the autotag api surface is gone', () => {
  for (const gone of [
    'app/api/autotag/classify/route.ts',
    'app/api/autotag/batch/route.ts',
    'app/api/autotag/conversations/route.ts',
  ]) {
    it(`${gone} is gone`, () => {
      expect(existsSync(join(webRoot, gone))).toBe(false);
    });
  }

  /**
   * The table stays: dropping it is a migration, and account erasure must keep
   * clearing whatever rows the routes already wrote.
   */
  it('account erasure still clears the rows those routes left behind', () => {
    const erasure = readFileSync(join(webRoot, 'lib/server/account-erasure.ts'), 'utf8');
    expect(erasure).toContain("table: 'conversation_tags'");
  });
});
