import { describe, expect, it } from 'vitest';
import {
  classifyAssistantFence,
  renderClassifiedFenceHtml,
  type AssistantFence,
} from '../assistantFence';

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
  describe.each(['chrome', 'vscode'] as const)('%s HTML construction', (mode) => {
    const payload = 'invalid" data-injected="true"><img src=x onerror="alert(1)"> & "quotes"';

    it('encodes a fallback reason supplied by an untyped library caller', () => {
      const text = '<svg onload="alert(1)"> & "quoted" fallback';
      const fence = {
        kind: 'fallback',
        reason: payload,
        language: 'unknown',
        text,
      } as unknown as AssistantFence;
      const template = document.createElement('template');
      template.innerHTML = renderClassifiedFenceHtml(fence, mode)!;

      expect(template.content.querySelector('p')?.getAttribute('data-answer-fallback')).toBe(
        payload,
      );
      expect(template.content.querySelector('p')?.textContent).toBe(text);
      expect(
        template.content.querySelector('img, svg, script, [onerror], [onload], [data-injected]'),
      ).toBeNull();
    });

    it.each(['min', 'max'] as const)(
      'encodes a slider %s supplied by an untyped library caller',
      (field) => {
        const slider = classifyAssistantFence(
          'slider',
          'label: Budget\nmin: 0\nmax: 500\nvalue: 250\nprefix: $',
        );
        if (slider.kind !== 'slider') throw new Error('The slider fixture did not classify.');
        const fence = { ...slider, [field]: payload } as unknown as AssistantFence;
        const template = document.createElement('template');
        template.innerHTML = renderClassifiedFenceHtml(fence, mode)!;

        expect(template.content.querySelector('p')?.textContent).toBe(
          `$250 (${field === 'min' ? payload : 0} to ${field === 'max' ? payload : 500})`,
        );
        expect(
          template.content.querySelector('img, svg, script, [onerror], [onload], [data-injected]'),
        ).toBeNull();
      },
    );

    it.each(['email', 'writing', 'form', 'card', 'chart'] as const)(
      'preserves literal %s content without constructing input elements',
      (language) => {
        const text = 'Keep </textarea><svg onload="alert(1)"> & "quotes"';
        const source = {
          email: `Subject: ${text}\n\nHello team.`,
          writing: `  ${text}  \nsecond line\n\n`,
          form: `title: ${text}\ntext: Name | Sample\nsubmit: Apply`,
          card: `title: ${text}\nsubtitle: Review\n\n${text}`,
          chart: `title: ${text}\ntype: bar\nJan | 10\nFeb | 20`,
        }[language];
        const fence = classifyAssistantFence(language, source);
        expect(fence.kind).toBe(language);
        const template = document.createElement('template');
        template.innerHTML = renderClassifiedFenceHtml(fence, mode)!;

        expect(template.content.textContent).toContain(text);
        expect(template.content.querySelector('svg, img, script, [onload], [onerror]')).toBeNull();
        if (language === 'chart') {
          expect(
            Array.from(template.content.querySelectorAll('tbody td'), (cell) => cell.textContent),
          ).toEqual(['Jan', '10', 'Feb', '20']);
        } else {
          const expectedCopy = language === 'card' ? text : source;
          expect(template.content.querySelector('textarea, pre code')?.textContent).toBe(
            expectedCopy,
          );
        }
      },
    );
  });

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
