import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatConversationAsMarkdown } from '@/services/fileCreation';
import type { ChatMessage } from '@/types/chat';

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_ROOTS = ['app', 'src', 'components', 'hooks', 'services', 'lib'];

const COPY_PRIMITIVE = 'src/shared/hooks/useCopyAction.ts';
const CLIPBOARD_IMPORT = /from '@\/lib\/clipboard'/;
const USES_COPY_ACTION = /\buseCopyAction\s*\(/;
// A surface either paints the status the hook returns, or branches on the
// boolean the write resolved to. Ignoring both is what left a control looking
// like it had worked.
const ANSWERS_THE_OUTCOME =
  /\bcopyControlLabel\s*\(|\b(copyStatus|linkCopyStatus|status)\s*===\s*'(copied|failed)'|\bif\s*\(await\s+copy(Link)?\s*\(/;
const OFFERS_SHARE = /\bShare\.share\s*\(|\bshareFile\s*\(|\bhandleShare\b|\bhandleShowExport\b/;

// The inline code-block button sits inside an assistant message that carries
// the app's Share control, so it is the one copy affordance that does not
// repeat it. Nothing else may join this list.
const COPY_WITHOUT_OWN_SHARE = ['src/features/chat/components/CodeBlockCopyButton.tsx'];

// The object-valued fields a message carries. Interpolating one of these into
// a copy payload is what puts "[object Object]" on the clipboard.
const OBJECT_FIELD_INTERPOLATION =
  /\$\{[^}]*\.(metadata|toolCalls|attachments|citations|sources|artifacts|approvalRequest)\s*\}/;

function sourceFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push({
        path: relative(MOBILE_ROOT, full),
        text: readFileSync(full, 'utf8'),
      });
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(MOBILE_ROOT, root));
  return found;
}

const FILES = sourceFiles();
const COPY_SURFACES = FILES.filter((file) => USES_COPY_ACTION.test(file.text));

describe('every copy control in the app', () => {
  it('has copy controls to measure, so an empty sweep cannot pass', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(COPY_SURFACES.length).toBeGreaterThan(4);
  });

  it('reaches the clipboard only through the one primitive that reports the outcome', () => {
    const direct = FILES.filter(
      (file) => CLIPBOARD_IMPORT.test(file.text) && file.path !== COPY_PRIMITIVE,
    ).map((file) => file.path);

    expect(direct).toEqual([]);
  });

  it('shows the user which state the control ended in', () => {
    const silent = COPY_SURFACES.filter((file) => !ANSWERS_THE_OUTCOME.test(file.text)).map(
      (file) => file.path,
    );

    expect(silent).toEqual([]);
  });

  it('offers a share route beside the copy, for the clipboard the OS refuses', () => {
    const copyOnly = COPY_SURFACES.filter(
      (file) => file.path !== COPY_PRIMITIVE && !OFFERS_SHARE.test(file.text),
    ).map((file) => file.path);

    expect(copyOnly).toEqual(COPY_WITHOUT_OWN_SHARE);
  });

  it('never interpolates a structured field into text bound for the clipboard', () => {
    const stringified = FILES.filter((file) => OBJECT_FIELD_INTERPOLATION.test(file.text)).map(
      (file) => file.path,
    );

    expect(stringified).toEqual([]);
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'assistant',
    content: 'answer',
    createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    ...overrides,
  } as ChatMessage;
}

describe('the text a conversation copy puts on the clipboard', () => {
  it('keeps a fenced code block byte for byte, indentation and blank lines included', () => {
    const code = ['```python', 'def main():', '', '    return 1', '```'].join('\n');

    const markdown = formatConversationAsMarkdown([message({ content: code })], 'Session');

    expect(markdown).toContain(code);
  });

  it('carries the structure Markdown readers expect rather than one flat line', () => {
    const markdown = formatConversationAsMarkdown(
      [message({ role: 'user', content: 'ask' }), message({ content: '**bold** answer' })],
      'Session',
    );

    expect(markdown).toContain('# Session');
    expect(markdown).toContain('**bold** answer');
    expect(markdown.split('\n').length).toBeGreaterThan(4);
  });

  it('is plain text a receiving app can paste, with no object ever stringified into it', () => {
    const markdown = formatConversationAsMarkdown(
      [
        message({
          content: 'answer',
          metadata: { conversationId: 'c1', usage: { tokens: 12 } },
          toolCalls: [{ id: 't1', name: 'search', status: 'completed' }],
          attachments: [{ url: 'f', mimeType: 'text/plain', fileName: 'f.txt' }],
        } as Partial<ChatMessage>),
      ],
      'Session',
    );

    expect(markdown).not.toContain('[object Object]');
    expect(typeof markdown).toBe('string');
  });
});
