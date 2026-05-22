import { describe, expect, it } from 'vitest';
import { isValidUuid } from '../../src/validations/ids';

describe('id validations', () => {
  it('accepts RFC 4122 UUIDs used by route ownership checks', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects missing, malformed, or unsafe ids', () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-71d4-a716-446655440000')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000;drop table')).toBe(false);
  });
});
