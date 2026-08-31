import { describe, expect, it } from 'vitest';

import { isMessageContinuable, looksTruncated } from '../continue-generation';

describe('looksTruncated', () => {
  it('flags prose that stops mid-sentence', () => {
    // The observed case: finish_reason stop, stopReason end-turn, and an answer
    // ending on "ensures continuous nighttime luminosity".
    expect(
      looksTruncated(
        'Selecting plants with silver, gray, or white-variegated leaves ensures continuous nighttime luminosity',
      ),
    ).toBe(true);
  });

  it('accepts prose that ends on a sentence', () => {
    expect(looksTruncated('That is the whole of the argument.')).toBe(false);
    expect(looksTruncated('Is that the whole of the argument?')).toBe(false);
    expect(looksTruncated('The remaining steps are as follows:')).toBe(false);
  });

  it('does not judge a list, heading, quote or table row', () => {
    // These routinely end without punctuation and say nothing about completeness.
    expect(looksTruncated('Plants to consider:\n- Silver artemisia and lambs ear')).toBe(false);
    expect(looksTruncated('Body text here.\n\n## Choosing the right plants')).toBe(false);
    expect(looksTruncated('Body.\n\n| Plant | Season |\n| --- | --- |\n| Yucca | Summer |')).toBe(
      false,
    );
    expect(looksTruncated('An aside.\n\n> A quoted line without a full stop')).toBe(false);
    expect(looksTruncated('Steps:\n1. Prepare the bed thoroughly first')).toBe(false);
  });

  it('flags an unclosed code fence', () => {
    expect(looksTruncated('Here is the setup:\n\n```ts\nconst a = 1;')).toBe(true);
    expect(looksTruncated('Here is the setup:\n\n```ts\nconst a = 1;\n```')).toBe(false);
  });

  it('ignores a fragment too short to judge', () => {
    expect(looksTruncated('Yes')).toBe(false);
    expect(looksTruncated('')).toBe(false);
    expect(looksTruncated(null)).toBe(false);
  });

  it('accepts emphasis and closing brackets as endings', () => {
    expect(looksTruncated('That is the **whole argument**')).toBe(false);
    expect(looksTruncated('The result is shown above (see the table)')).toBe(false);
  });
});

describe('isMessageContinuable', () => {
  const base = { role: 'assistant', isStreaming: false } as const;

  it('offers Continue for a length-capped turn', () => {
    expect(
      isMessageContinuable({
        ...base,
        content: 'Half an answer.',
        metadata: { finishReason: 'length' },
      }),
    ).toBe(true);
  });

  it('offers Continue when a stop-finished turn reads as cut off', () => {
    expect(
      isMessageContinuable({
        ...base,
        content: 'Selecting plants with silver leaves ensures continuous nighttime luminosity',
        metadata: { finishReason: 'stop' },
      }),
    ).toBe(true);
  });

  it('does not offer Continue on a complete answer', () => {
    expect(
      isMessageContinuable({
        ...base,
        content: 'That covers every section you asked for.',
        metadata: { finishReason: 'stop' },
      }),
    ).toBe(false);
  });

  it('still refuses a streaming or failed turn', () => {
    const cut = 'Selecting plants with silver leaves ensures continuous nighttime luminosity';
    expect(isMessageContinuable({ ...base, isStreaming: true, content: cut })).toBe(false);
    expect(isMessageContinuable({ ...base, content: cut, error: 'boom' })).toBe(false);
    expect(isMessageContinuable({ role: 'user', content: cut })).toBe(false);
  });
});
