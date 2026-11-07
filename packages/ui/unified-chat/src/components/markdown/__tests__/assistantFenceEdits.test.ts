import { describe, expect, it } from 'vitest';
import {
  applyAssistantFenceEdit,
  collectInlineImageSources,
  countEditableAssistantFences,
} from '../assistantFenceEdits';

describe('assistant fence edits', () => {
  it('collects only real inline image resources, leaving URL examples and HTML artifacts alone', () => {
    const source = [
      '![Chart](/api/files/chart)',
      '![Reference][photo]',
      '[photo]: /api/files/photo',
      '```gallery\nOne | /api/files/one | Caption\nTwo | javascript:invalid\n```',
      '```carousel\nThree | Description | /api/files/three\n```',
      '```python\nprint("/api/files/example")\n```',
      '```html\n<img src="/api/files/artifact">\n```',
    ].join('\n\n');
    expect([...collectInlineImageSources(source)]).toEqual([
      '/api/files/chart',
      '/api/files/photo',
      '/api/files/one',
      '/api/files/three',
    ]);
  });

  it('edits exactly one repeated block and preserves adjacent output bytes', () => {
    const markdown = [
      'Intro',
      '```writing',
      'same',
      '```',
      '```python',
      'print("same")',
      '```',
      '```writing',
      'same',
      '```',
      'Outro',
    ].join('\n');
    expect(countEditableAssistantFences(markdown)).toBe(2);
    expect(
      applyAssistantFenceEdit(markdown, {
        index: 1,
        language: 'writing',
        source: 'same',
        content: 'second only',
      }),
    ).toBe(markdown.replace('```writing\nsame\n```\nOutro', '```writing\nsecond only\n```\nOutro'));
  });

  it('fails closed for stale text, a different kind, an invalid index or a noneditable fence', () => {
    const markdown = '```writing\ncurrent\n```\n```python\nprint(1)\n```';
    expect(
      applyAssistantFenceEdit(markdown, {
        index: 0,
        language: 'writing',
        source: 'old',
        content: 'lost',
      }),
    ).toBeNull();
    expect(
      applyAssistantFenceEdit(markdown, {
        index: 0,
        language: 'email',
        source: 'current',
        content: 'lost',
      }),
    ).toBeNull();
    expect(
      applyAssistantFenceEdit(markdown, {
        index: 1,
        language: 'python',
        source: 'print(1)',
        content: 'lost',
      }),
    ).toBeNull();
    expect(
      applyAssistantFenceEdit(markdown, {
        index: -1,
        language: 'writing',
        source: 'current',
        content: 'lost',
      }),
    ).toBeNull();
  });

  it('lengthens the outer fence so pasted code cannot escape the edited block', () => {
    const markdown = 'Before\n```prompt\nOriginal\n```\nAfter';
    const content = 'Use this:\n```html\n<script>parent.location="x"</script>\n```';
    const next = applyAssistantFenceEdit(markdown, {
      index: 0,
      language: 'prompt',
      source: 'Original',
      content,
    });
    expect(next).toBe(`Before\n\`\`\`\`prompt\n${content}\n\`\`\`\`\nAfter`);
    expect(next && countEditableAssistantFences(next)).toBe(1);
    expect(
      next &&
        applyAssistantFenceEdit(next, {
          index: 0,
          language: 'prompt',
          source: content,
          content: 'Reopened',
        }),
    ).toBe('Before\n````prompt\nReopened\n````\nAfter');
  });

  it('preserves tilde fence content and carriage-return line endings', () => {
    const markdown = 'Before\r\n~~~snippet\r\n\\(literal\\)\r\n~~~\r\nAfter';
    const next = applyAssistantFenceEdit(markdown, {
      index: 0,
      language: 'snippet',
      source: '\\(literal\\)',
      content: 'First\nSecond',
    });
    expect(next).toBe('Before\r\n~~~snippet\r\nFirst\r\nSecond\r\n~~~\r\nAfter');
  });

  it.each([
    ['```', '````'],
    ['~~~', '~~~~~'],
  ])('counts only literal %s marker runs while preserving URL text', (originalFence, nextFence) => {
    const markdown = `Before\n${originalFence}document\nOriginal\n${originalFence}\nAfter`;
    const content = [
      'https://developer.mozilla.org/en-US/docs/Glossary/SSR',
      'https://developerXmozilla.org/en-US/docs/Glossary/SSR',
      'Literal pattern text: [a-z]+(value).*',
      '```',
      '~~~~',
      'Separated ` markers ` and ~ markers ~ stay separate.',
    ].join('\n');
    const next = applyAssistantFenceEdit(markdown, {
      index: 0,
      language: 'document',
      source: 'Original',
      content,
    });
    expect(next).toBe(`Before\n${nextFence}document\n${content}\n${nextFence}\nAfter`);
    expect(countEditableAssistantFences(next!)).toBe(1);
    expect(
      applyAssistantFenceEdit(next!, {
        index: 0,
        language: 'document',
        source: content,
        content: 'Reopened',
      }),
    ).toBe(`Before\n${nextFence}document\nReopened\n${nextFence}\nAfter`);
  });
});
