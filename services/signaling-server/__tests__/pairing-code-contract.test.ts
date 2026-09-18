import { describe, expect, it } from 'vitest';

import {
  PAIRING_CODE_LENGTH as CONTRACT_CODE_LENGTH,
  RELAY_PAIRING_CODE_PATTERN,
  isRelayPairingCode,
} from '../../../packages/contracts/types/src/pairing';
import { PAIRING_CODE_LENGTH, PAIRING_CODE_PATTERN } from '../src/constants.js';

// This service ships as its own container and declares no workspace
// dependencies, so it cannot import the contract at runtime. It keeps its own
// constants and this pins them to the one definition every other surface reads,
// which is what stops the two from drifting apart again.
describe('the relay issues the pairing code the contract describes', () => {
  it('agrees with the contract on length and shape', () => {
    expect(PAIRING_CODE_LENGTH).toBe(CONTRACT_CODE_LENGTH);
    expect(PAIRING_CODE_PATTERN.source).toBe(RELAY_PAIRING_CODE_PATTERN.source);
  });

  it('accepts and refuses the same codes the contract does', () => {
    const cases = [
      'ABCD1234EFGH',
      'ABCD1234EFG',
      'ABCD1234EFGHI',
      'abcd1234efgh',
      'ABCD-1234-EFG',
      '',
    ];

    for (const candidate of cases) {
      expect(PAIRING_CODE_PATTERN.test(candidate)).toBe(isRelayPairingCode(candidate));
    }
  });
});
