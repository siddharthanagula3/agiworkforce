import { describe, it, expect } from 'vitest';
import { extractCodeBlock } from '../platform/applyEdit';

describe('extractCodeBlock', () => {
  it('extracts a language-specific fenced code block', () => {
    const text = `Here is the fix:

\`\`\`typescript
const x = 42;
console.log(x);
\`\`\`

Done.`;

    expect(extractCodeBlock(text, 'typescript')).toBe('const x = 42;\nconsole.log(x);');
  });

  it('prefers the block tagged with the requested language over an earlier one', () => {
    const text = `\`\`\`json
{ "not": "code" }
\`\`\`

\`\`\`typescript
const chosen = true;
\`\`\``;

    expect(extractCodeBlock(text, 'typescript')).toBe('const chosen = true;');
  });

  it('falls back to any fenced code block when language does not match', () => {
    const text = `\`\`\`python
def hello():
    print("hi")
\`\`\``;

    expect(extractCodeBlock(text, 'typescript')).toBe('def hello():\n    print("hi")');
  });

  it('returns undefined when no code block is present', () => {
    expect(extractCodeBlock('Just prose, no fences at all.', 'typescript')).toBeUndefined();
  });

  it('extracts the first code block when multiple are present', () => {
    const text = `\`\`\`typescript
const first = 1;
\`\`\`

\`\`\`typescript
const second = 2;
\`\`\``;

    expect(extractCodeBlock(text, 'typescript')).toBe('const first = 1;');
  });

  it('handles code blocks with no language identifier', () => {
    expect(extractCodeBlock('```\nplain code block\n```', 'javascript')).toBe('plain code block');
  });

  it('trims trailing whitespace from extracted code', () => {
    expect(extractCodeBlock('```typescript\nconst x = 1;\n   \n```', 'typescript')).toBe(
      'const x = 1;',
    );
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

  it('matches language case-insensitively, in preference to an earlier foreign fence', () => {
    const text = `\`\`\`json
{ "not": "code" }
\`\`\`

\`\`\`TypeScript
const x = 1;
\`\`\``;

    expect(extractCodeBlock(text, 'typescript')).toBe('const x = 1;');
  });

  it('treats a languageId containing regex metacharacters as literal text', () => {
    expect(extractCodeBlock('```c++\nint main() {}\n```', 'c++')).toBe('int main() {}');
    expect(extractCodeBlock('```objective-c\nint x;\n```', 'objective-c')).toBe('int x;');
  });

  it('does not let a metacharacter languageId match a different fence', () => {
    expect(extractCodeBlock('```typescript\nconst x = 1;\n```', 'c++')).toBe('const x = 1;');
  });
});
