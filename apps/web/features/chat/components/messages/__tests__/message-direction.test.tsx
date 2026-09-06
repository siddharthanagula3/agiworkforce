import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = readFileSync(path.resolve(__dirname, '../MessageBubble.tsx'), 'utf8');

describe('message content direction', () => {
  // Arabic answers rendered left-to-right with no dir attribute, so RTL text
  // was laid out and aligned as if it were English.
  it('lets the message body infer direction from its own content', () => {
    expect(SOURCE).toContain('dir="auto"');
  });

  it('aligns with a logical property so alignment follows direction', () => {
    expect(SOURCE).toContain('break-words text-start');
    expect(SOURCE).not.toContain('break-words text-left');
  });

  // `overflow-wrap-anywhere` was never a Tailwind utility, so it emitted no CSS
  // and a long URL in a `w-fit` user bubble overflowed its column.
  it('wraps the user bubble with a utility Tailwind actually generates', () => {
    expect(SOURCE).toContain("isUser && 'user-bubble wrap-anywhere'");
    expect(SOURCE).not.toContain('overflow-wrap-anywhere');
  });
});
