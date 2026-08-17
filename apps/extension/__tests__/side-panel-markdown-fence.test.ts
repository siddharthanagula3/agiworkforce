import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/features/side-panel/markdown';

describe('renderMarkdown code fences', () => {
  it('renders a still-streaming unterminated fence as a code block', () => {
    const result = renderMarkdown('```js\nconst answer = 1;');

    expect(result).toContain('<pre><code>const answer = 1;</code></pre>');
    expect(result).not.toContain('```');
  });

  it('keeps the fence info string out of the code body', () => {
    const result = renderMarkdown('```ts title=example.ts\nconst answer = 1;\n```');

    expect(result).toContain('<pre><code>const answer = 1;</code></pre>');
    expect(result).not.toContain('title=example.ts');
  });
});
