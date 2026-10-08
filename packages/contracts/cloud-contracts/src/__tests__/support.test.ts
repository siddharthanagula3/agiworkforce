import { describe, expect, it } from 'vitest';
import {
  SUPPORT_ABSTENTION_REASONS,
  SUPPORT_HISTORY_LIMIT,
  SUPPORT_MAX_HISTORY_TURN_LENGTH,
  SUPPORT_MAX_QUESTION_LENGTH,
  SupportAskRequestSchema,
} from '../support';

const turn = (content: string) => ({ role: 'user' as const, content });

describe('SupportAskRequestSchema', () => {
  it('holds a support question to a length a pasted program does not fit in', () => {
    expect(SUPPORT_MAX_QUESTION_LENGTH).toBe(600);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'x'.repeat(SUPPORT_MAX_QUESTION_LENGTH),
        surface: 'app',
      }).success,
    ).toBe(true);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'x'.repeat(SUPPORT_MAX_QUESTION_LENGTH + 1),
        surface: 'app',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty question and an unknown surface', () => {
    expect(SupportAskRequestSchema.safeParse({ message: '   ', surface: 'app' }).success).toBe(
      false,
    );
    expect(SupportAskRequestSchema.safeParse({ message: 'hi', surface: 'desktop' }).success).toBe(
      false,
    );
  });

  it('accepts exactly the history the engine reads and nothing larger', () => {
    const atLimit = Array.from({ length: SUPPORT_HISTORY_LIMIT }, () =>
      turn('x'.repeat(SUPPORT_MAX_HISTORY_TURN_LENGTH)),
    );
    expect(
      SupportAskRequestSchema.safeParse({ message: 'hi', surface: 'app', history: atLimit })
        .success,
    ).toBe(true);

    expect(
      SupportAskRequestSchema.safeParse({
        message: 'hi',
        surface: 'app',
        history: [...atLimit, turn('one more')],
      }).success,
    ).toBe(false);
    expect(
      SupportAskRequestSchema.safeParse({
        message: 'hi',
        surface: 'app',
        history: [turn('x'.repeat(SUPPORT_MAX_HISTORY_TURN_LENGTH + 1))],
      }).success,
    ).toBe(false);
  });
});

describe('support abstention reasons', () => {
  it('names an out-of-scope refusal, once', () => {
    expect(SUPPORT_ABSTENTION_REASONS.filter((reason) => reason === 'out_of_scope')).toHaveLength(
      1,
    );
    expect(new Set(SUPPORT_ABSTENTION_REASONS).size).toBe(SUPPORT_ABSTENTION_REASONS.length);
  });
});
