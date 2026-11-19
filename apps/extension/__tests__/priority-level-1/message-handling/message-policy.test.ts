import { describe, expect, test } from 'vitest';
import {
  DISCOVERY_MESSAGE_TYPES,
  MESSAGE_POLICY,
  getMessagePolicy,
} from '../../../src/background/policy';

describe('L1 Message Handling - Policy resolution', () => {
  test('HAPPY_PATH: every declared policy resolves with valid fields', () => {
    for (const [type, policy] of Object.entries(MESSAGE_POLICY)) {
      const resolved = getMessagePolicy(type);
      expect(resolved).toEqual(policy);
      expect(['extension-page-only', 'allowlisted-tab', 'discovery']).toContain(
        resolved.senderClass,
      );
      expect(typeof resolved.allowsCrossTab).toBe('boolean');
    }
  });

  test('HAPPY_PATH: read-only navigation message uses allowlisted-tab cross-tab default', () => {
    const policy = getMessagePolicy('GET_PAGE_INFO');
    expect(policy.senderClass).toBe('allowlisted-tab');
    expect(policy.allowsCrossTab).toBe(true);
  });

  test('SECURITY: discovery class holds only GET_PAGE_ACCESS (no other message bypasses the allowlist)', () => {
    expect([...DISCOVERY_MESSAGE_TYPES]).toEqual(['GET_PAGE_ACCESS']);
  });
});
