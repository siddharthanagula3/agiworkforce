import { describe, expect, it } from 'vitest';

import {
  findHighEntropyStrings,
  isHighEntropyToken,
  shannonEntropyBits,
  HIGH_ENTROPY_DETECTION_NAME,
} from '../entropy';
import { scanForSecrets } from '../secrets-audit';

const RANDOM_BASE64 = 'Xk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx';
const RANDOM_HEX_ODD_LENGTH = 'a3f9c1e77b2d40685af3c9012e';

describe('shannon entropy', () => {
  it('scores a repeated character at zero and a uniform alphabet at its ceiling', () => {
    expect(shannonEntropyBits('aaaaaaaa')).toBe(0);
    expect(shannonEntropyBits('abcd')).toBeCloseTo(2, 6);
    expect(shannonEntropyBits('')).toBe(0);
  });

  it('scores prose well below a random token of the same length', () => {
    const prose = 'the quick brown fox jumps over the lazy dog again';
    expect(shannonEntropyBits(prose)).toBeLessThan(shannonEntropyBits(RANDOM_BASE64));
  });
});

describe('high entropy tokens', () => {
  it('accepts a random base64 credential', () => {
    expect(isHighEntropyToken(RANDOM_BASE64)).toBe(true);
  });

  it('rejects anything shorter than a credential', () => {
    expect(isHighEntropyToken('Xk7pQ2vLm9Rt')).toBe(false);
  });

  it('rejects a uuid, which is high entropy and not a secret', () => {
    expect(isHighEntropyToken('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(false);
  });

  it('rejects digest-shaped hex, because a checksum is not a credential', () => {
    expect(
      isHighEntropyToken('5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'),
    ).toBe(false);
    expect(isHighEntropyToken('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe(false);
  });

  it('accepts hex that is not a digest length', () => {
    expect(isHighEntropyToken(RANDOM_HEX_ODD_LENGTH)).toBe(true);
  });

  it('rejects a long hyphenated name, which reads as words', () => {
    expect(isHighEntropyToken('feature-flag-rollout-controller-config-name')).toBe(false);
  });

  it('rejects a token drawn from too few distinct characters', () => {
    expect(isHighEntropyToken('abababababababababababababab')).toBe(false);
  });

  it('reports the position and the measured entropy of each find', () => {
    const found = findHighEntropyStrings(`token = "${RANDOM_BASE64}"`);

    expect(found).toHaveLength(1);
    expect(found[0]?.value).toBe(RANDOM_BASE64);
    expect(found[0]?.entropyBits).toBeGreaterThan(4);
    expect(found[0]?.position).toBeGreaterThan(0);
  });

  it('finds nothing in ordinary prose or a file path', () => {
    expect(
      findHighEntropyStrings('apps/web/lib/security/secrets-audit.ts holds the pattern registry'),
    ).toEqual([]);
  });
});

describe('secret scan with entropy enabled', () => {
  it('leaves the entropy detector off by default', () => {
    expect(scanForSecrets(`value = "${RANDOM_BASE64}"`)).toEqual([]);
  });

  it('reports the unrecognised token when asked, at a severity below a named match', () => {
    const detections = scanForSecrets(`value = "${RANDOM_BASE64}"`, { includeHighEntropy: true });

    expect(detections).toHaveLength(1);
    expect(detections[0]?.name).toBe(HIGH_ENTROPY_DETECTION_NAME);
    expect(detections[0]?.severity).toBe('medium');
    expect(detections[0]?.preview).not.toContain(RANDOM_BASE64);
  });

  it('does not report a token a named pattern already matched at the same position', () => {
    // Composed at runtime: a literal of this shape in the file is a secret as
    // far as push protection is concerned, and it blocks the push.
    const content = `sk_live_${'EXAMPLE'.repeat(4)}`;
    const detections = scanForSecrets(content, { includeHighEntropy: true });

    expect(detections.filter((d) => d.name === HIGH_ENTROPY_DETECTION_NAME)).toHaveLength(0);
  });
});
