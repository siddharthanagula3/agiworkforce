/**
 * L1 Error States — malformed and hostile validator input.
 *
 * The extension treats all page- and bridge-supplied data as untrusted. These
 * tests assert the real validators degrade safely (return null/false/undefined)
 * rather than throwing or letting a bad payload through.
 */

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
    // Cast through unknown — the runtime guard must hold even when callers
    // hand it the wrong shape (LLM/bridge output is not type-checked).
    expect(validateShortcutActions(null as unknown as [])).toBe(false);
    expect(validateShortcutActions({} as unknown as [])).toBe(false);
    expect(validateShortcutActions([null] as unknown as [])).toBe(false);
    expect(validateShortcutActions([{ notType: 'x' }] as unknown as [])).toBe(false);
  });

  test('ERROR: oversized action fields are rejected as a whole plan', () => {
    const bigSelector = 'a'.repeat(2000); // > MAX_SELECTOR_LENGTH (1024)
    expect(validateShortcutActions([{ type: 'click', selector: bigSelector } as never])).toBe(
      false,
    );
  });

  test('ERROR: undefined JSON budget edge returns undefined, never NaN/throw', () => {
    expect(safeJsonParse('{}', 0)).toBeUndefined(); // budget too small
    expect(safeJsonParse(123 as unknown as string, 100)).toBeUndefined(); // wrong type
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
