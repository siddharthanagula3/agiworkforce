import { describe, expect, it } from 'vitest';
import { noticeAccountFingerprint } from '../index';

/**
 * The web and the Chrome extension both record a shown-once notice under this
 * fingerprint. A value already stored in a browser has to keep matching, so the
 * output is pinned to what the web wrote when the fingerprint was introduced.
 */
describe('the shown-once notice account fingerprint', () => {
  it('matches the values browsers already hold', () => {
    expect(noticeAccountFingerprint('agi.notice.free-plan-training', 'user_a')).toBe('m9oi2e6ef7');
    expect(noticeAccountFingerprint('agi.notice.free-plan-training', 'user_b')).toBe('filxrhhnxw');
  });

  it('differs per account and per notice, and never contains the account id', () => {
    const fingerprint = noticeAccountFingerprint('agi.notice.a', 'user_private_id');
    expect(fingerprint).not.toContain('user_private_id');
    expect(fingerprint).not.toBe(noticeAccountFingerprint('agi.notice.b', 'user_private_id'));
    expect(fingerprint).not.toBe(noticeAccountFingerprint('agi.notice.a', 'user_other_id'));
  });
});
