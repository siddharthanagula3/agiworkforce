/**
 * applyEdit.test.ts — Tests for extractCodeBlock and applyLlmEdit utilities
 */

import { describe, it, expect } from 'vitest';

// Replicate extractCodeBlock for testing (original imports vscode)
function extractCodeBlock(text: string, lang: string): string | undefined {
  const langPattern = new RegExp('```(?:' + lang + ')\\s*\\n([\\s\\S]*?)```', 'i');
  const langMatch = langPattern.exec(text);
  if (langMatch?.[1] !== undefined) {
    return langMatch[1].trimEnd();
  }

  const anyPattern = /```(?:\w*)\s*\n([\s\S]*?)```/;
  const anyMatch = anyPattern.exec(text);
  if (anyMatch?.[1] !== undefined) {
    return anyMatch[1].trimEnd();
  }

  return undefined;
}

describe('extractCodeBlock', () => {
  it('extracts a language-specific fenced code block', () => {
    const text = `Here is the fix:

\`\`\`typescript
const x = 42;
console.log(x);
\`\`\`

Done.`;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBe('const x = 42;\nconsole.log(x);');
  });

  it('falls back to any fenced code block when language does not match', () => {
    const text = `\`\`\`python
def hello():
    print("hi")
\`\`\``;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBe('def hello():\n    print("hi")');
  });

  it('returns undefined when no code block is present', () => {
    const text = 'Just some plain text explanation without any code blocks.';
    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBeUndefined();
  });

  it('extracts the first code block when multiple are present', () => {
    const text = `\`\`\`typescript
const first = 1;
\`\`\`

\`\`\`typescript
const second = 2;
\`\`\``;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBe('const first = 1;');
  });

  it('handles code blocks with no language identifier', () => {
    const text = `\`\`\`
plain code block
\`\`\``;

    const result = extractCodeBlock(text, 'javascript');
    expect(result).toBe('plain code block');
  });

  it('trims trailing whitespace from extracted code', () => {
    const text = `\`\`\`typescript
const x = 1;
\`\`\``;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBe('const x = 1;');
  });

  it('handles multiline code blocks correctly', () => {
    const text = `\`\`\`typescript
function add(a: number, b: number): number {
  return a + b;
}

export default add;
\`\`\``;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toContain('function add');
    expect(result).toContain('export default add;');
  });

  it('matches language case-insensitively', () => {
    const text = `\`\`\`TypeScript
const x = 1;
\`\`\``;

    const result = extractCodeBlock(text, 'typescript');
    expect(result).toBe('const x = 1;');
  });
});
