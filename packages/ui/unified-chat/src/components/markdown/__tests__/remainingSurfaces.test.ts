import { describe, expect, it } from 'vitest';
import { classifyAssistantFence, renderClassifiedFenceHtml } from '../assistantFence';

const FENCES: ReadonlyArray<{ language: string; body: string; text: string }> = [
  { language: 'radio', body: 'prompt: Plan\n* Basic\n- Advanced', text: 'Basic' },
  {
    language: 'slider',
    body: 'label: Budget\nmin: 0\nmax: 500\nvalue: 250\nprefix: $',
    text: '$250',
  },
  { language: 'checks', body: 'title: Preferences\n- [x] Search', text: 'Enabled' },
  { language: 'dropdown', body: 'label: Theme\nLight\nDark\nselected: Dark', text: 'Dark' },
  { language: 'gallery', body: 'Cover | #112233', text: 'Cover' },
  { language: 'details', body: 'Advanced settings\nShown on request.', text: 'Shown on request.' },
  { language: 'map', body: 'Library | Main reading room', text: 'Library' },
  { language: 'actions', body: 'Copy note | The note is ready.', text: 'The note is ready.' },
  { language: 'files', body: 'notes.pdf | PDF | Summary', text: 'notes.pdf' },
  {
    language: 'transcript',
    body: '00:12 | Speaker 1 | Hello there',
    text: 'not an audio player',
  },
  { language: 'timeline', body: 'Plan | Define scope | Complete', text: 'Complete' },
];

describe('remaining answer surfaces', () => {
  it.each(['chrome', 'vscode'] as const)(
    'shows email headers once and preserves exact copy text in %s',
    (mode) => {
      const fence = classifyAssistantFence(
        'email',
        'To: team@example.com\nCc: review@example.com\nSubject: Review\n\nHello team.',
      );
      if (fence.kind !== 'email') throw new Error('The email fixture did not classify as email.');
      const template = document.createElement('template');
      template.innerHTML = renderClassifiedFenceHtml(fence, mode)!;
      expect(template.content.textContent?.match(/Subject: Review/g)).toHaveLength(1);
      expect(template.content.textContent?.match(/To: team@example.com/g)).toHaveLength(1);
      expect(template.content.querySelector('pre code')?.textContent).toBe(fence.copyText);
    },
  );

  it.each(['chrome', 'vscode'] as const)(
    'keeps the local-edit notice outside the copy body in %s',
    (mode) => {
      const fence = classifyAssistantFence('writing', 'Draft for review.');
      if (fence.kind !== 'writing')
        throw new Error('The writing fixture did not classify as writing.');
      const template = document.createElement('template');
      template.innerHTML = renderClassifiedFenceHtml(fence, mode)!;
      expect(template.content.querySelector('.answer-preview-note')?.textContent).toBe(
        'Edits stay in this preview. Copy to keep them.',
      );
      expect(template.content.querySelector('textarea, pre code')?.textContent).toBe(
        fence.copyText,
      );
    },
  );

  it.each(FENCES)(
    'renders $language as a surface instead of a code card',
    ({ language, body, text }) => {
      const fence = classifyAssistantFence(language, body);
      expect(fence.kind).not.toBe('code');
      expect(fence.kind).not.toBe('fallback');
      const html = renderClassifiedFenceHtml(fence, 'vscode');
      expect(html).toContain(text);
      expect(html).toContain(`answer-surface-${language}`);
      expect(html).not.toContain('class="code-block-wrapper"');
    },
  );
});
