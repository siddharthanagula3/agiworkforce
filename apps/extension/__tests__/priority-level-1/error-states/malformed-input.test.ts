
import { describe, expect, test } from 'vitest';
import {
  safeJsonParse,
  validateBridgeUrl,
  validateGatewayUrl,
  validateShortcutActions,
} from '../../../src/background/policy';

describe('L1 Error States - Malformed input', () => {
  test('ERROR: validators reject empty / whitespace / garbage strings without throwing', () => {
    expect(validateBridgeUrl('')).toBeNull();
    expect(validateBridgeUrl('   ')).toBeNull();
    expect(validateGatewayUrl('')).toBeNull();
    expect(validateGatewayUrl('::::')).toBeNull();
  });

  test('ERROR: non-array / non-object action plans are rejected', () => {
    expect(validateShortcutActions(null as unknown as [])).toBe(false);
    expect(validateShortcutActions({} as unknown as [])).toBe(false);
    expect(validateShortcutActions([null] as unknown as [])).toBe(false);
    expect(validateShortcutActions([{ notType: 'x' }] as unknown as [])).toBe(false);
  });

  test('ERROR: oversized action fields are rejected as a whole plan', () => {
    const bigSelector = 'a'.repeat(2000);
    expect(validateShortcutActions([{ type: 'click', selector: bigSelector } as never])).toBe(
      false,
    );
  });

  test('ERROR: undefined JSON budget edge returns undefined, never NaN/throw', () => {
    expect(safeJsonParse('{}', 0)).toBeUndefined();
    expect(safeJsonParse(123 as unknown as string, 100)).toBeUndefined();
  });

  test('ERROR: forbidden navigation schemes in action value are rejected', () => {
    expect(
      validateShortcutActions([{ type: 'navigate', value: 'javascript:alert(1)' } as never]),
    ).toBe(false);
    expect(
      validateShortcutActions([{ type: 'navigate', value: 'data:text/html,x' } as never]),
    ).toBe(false);
  });
});
