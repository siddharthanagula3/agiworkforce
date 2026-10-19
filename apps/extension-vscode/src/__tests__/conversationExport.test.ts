import { describe, expect, it } from 'vitest';
import {
  conversationMarkdown,
  exportFileName,
} from '../features/sidebar-webview/conversationExport';

describe('conversation export', () => {
  it('writes each turn under who said it, in order', () => {
    expect(
      conversationMarkdown({
        title: 'Fix the off-by-one',
        transcriptTruncated: false,
        messages: [
          { role: 'user', text: 'Why does average() skip the last item?' },
          { role: 'assistant', text: 'The loop stops at `length - 1`.\n\n```ts\nfor (;;) {}\n```' },
          { role: 'assistant', text: '   ' },
        ],
      }),
    ).toBe(
      '# Fix the off-by-one\n\n## You\n\nWhy does average() skip the last item?\n\n## AGI\n\nThe loop stops at `length - 1`.\n\n```ts\nfor (;;) {}\n```\n',
    );
  });

  it('says so when only the newest messages could be exported', () => {
    expect(conversationMarkdown({ title: '', transcriptTruncated: true, messages: [] })).toBe(
      '# AGI conversation\n\n_Only the newest messages of this session were available to export._\n',
    );
  });

  it('names the file after the session title', () => {
    expect(exportFileName('Fix the off-by-one: average()')).toBe('fix-the-off-by-one-average.md');
    expect(exportFileName('???')).toBe('agi-conversation.md');
  });
});
