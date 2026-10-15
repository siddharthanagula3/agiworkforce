import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

describe('Streaming reply text', () => {
  it('draws no cursor after the text while a reply streams', () => {
    expect(css).not.toMatch(/\[data-streaming='true'\][^{}]*::after/);
    expect(css).not.toContain('transcript-caret');
  });

  it('still hides the uncommitted tail while a reply streams', () => {
    expect(css).toContain(".message-text[data-streaming='true'] > span:last-child {");
  });
});
