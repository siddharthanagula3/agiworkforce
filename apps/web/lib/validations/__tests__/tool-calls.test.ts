import { describe, it, expect } from 'vitest';

import { ToolCallResponseSchema, ToolCallResponseArraySchema } from '../tool-calls';

const validToolCall = {
  id: 'call_abc-123',
  type: 'function' as const,
  function: { name: 'get_weather', arguments: '{"city":"sf"}' },
};

describe('ToolCallResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(ToolCallResponseSchema.safeParse(validToolCall).success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _omit, ...rest } = validToolCall;
    expect(ToolCallResponseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects id with invalid characters', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        id: 'call abc',
      }).success,
    ).toBe(false);
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        id: '<script>',
      }).success,
    ).toBe(false);
  });

  it('rejects id longer than 128 chars', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        id: 'a'.repeat(129),
      }).success,
    ).toBe(false);
  });

  it('rejects type other than "function"', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        type: 'tool',
      }).success,
    ).toBe(false);
  });

  it('rejects function.name with invalid characters', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: '<script>', arguments: '{}' },
      }).success,
    ).toBe(false);
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: '1starts_with_digit', arguments: '{}' },
      }).success,
    ).toBe(false);
  });

  it('rejects function.name longer than 64 chars', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: 'a'.repeat(65), arguments: '{}' },
      }).success,
    ).toBe(false);
  });

  it('rejects arguments longer than 64 KiB', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: 'f', arguments: 'x'.repeat(65_537) },
      }).success,
    ).toBe(false);
  });

  it('arguments at exactly 64 KiB are accepted (boundary)', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: 'f', arguments: 'x'.repeat(65_536) },
      }).success,
    ).toBe(true);
  });

  it('arguments must be a string, not an object', () => {
    expect(
      ToolCallResponseSchema.safeParse({
        ...validToolCall,
        function: { name: 'f', arguments: { city: 'sf' } },
      }).success,
    ).toBe(false);
  });
});

describe('ToolCallResponseArraySchema', () => {
  it('accepts an empty array', () => {
    expect(ToolCallResponseArraySchema.safeParse([]).success).toBe(true);
  });

  it('accepts up to 32 items', () => {
    const items = new Array(32).fill(validToolCall);
    expect(ToolCallResponseArraySchema.safeParse(items).success).toBe(true);
  });

  it('rejects 33 items', () => {
    const items = new Array(33).fill(validToolCall);
    expect(ToolCallResponseArraySchema.safeParse(items).success).toBe(false);
  });

  it('rejects array with any invalid item', () => {
    const items = [validToolCall, { ...validToolCall, id: '<bad>' }];
    expect(ToolCallResponseArraySchema.safeParse(items).success).toBe(false);
  });
});
