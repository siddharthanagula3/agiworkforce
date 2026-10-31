import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdownInto } from '../src/features/side-panel/markdown';
import {
  MIXED_ASSISTANT_REPLY,
  MIXED_REPLY_THROUGH_EMAIL,
} from '@agiworkforce/unified-chat/assistant-fence';

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: {
      getMessage: (key: string, substitutions: string[] = []) =>
        key === 'spChecklistProgress'
          ? `${substitutions[0] ?? ''} of ${substitutions[1] ?? ''}`
          : '',
      getUILanguage: () => 'en',
    },
  };
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

async function render(text: string, onFollowUp?: (value: string) => void): Promise<HTMLElement> {
  const root = document.createElement('div');
  await renderMarkdownInto(root, text, onFollowUp ? { onFollowUp } : undefined);
  return root;
}

function assertOrder(text: string, parts: readonly string[]): void {
  let at = -1;
  for (const part of parts) {
    const next = text.indexOf(part, at + 1);
    expect(next, part).toBeGreaterThan(at);
    at = next;
  }
}

describe('chrome mixed assistant reply', () => {
  it.each(['  keep <tag> & "quotes"  ', 'first\nsecond  \n\n'])(
    'copies the exact prompt body without the fence separator: %j',
    async (body) => {
      const root = await render(['```prompt', body, '```'].join('\n'));
      const copy = [...root.querySelectorAll('button')].find(
        (button) => button.textContent === 'Copy full prompt',
      );
      expect(copy).toBeTruthy();
      copy?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(body);
    },
  );

  it('renders one mixed reply in order, with a chart table, fallbacks, copy, follow-up, and one email after growth', async () => {
    const partial = await render(MIXED_REPLY_THROUGH_EMAIL);
    expect(partial.querySelectorAll('section[data-lang="surface:email"]')).toHaveLength(1);

    const onFollowUp = vi.fn();
    const root = await render(`${MIXED_ASSISTANT_REPLY}\n\nMore prose.`, onFollowUp);
    assertOrder(root.textContent ?? '', [
      'Here is the plan in ordinary prose.',
      'ada@example.com',
      'const ready = true;',
      'Inspect the application.',
      'pnpm test',
      'Passed',
      'Month',
      'Requests',
      'Jan',
      '10',
      'Feb',
      '30',
      '1 of 2',
      'Writing blocks',
      '2 assertions failed',
      'Show the document',
      'title: Missing the address',
      'A widget this client does not draw.',
      'Open the application.',
      'More prose.',
    ]);

    expect(root.querySelectorAll('section[data-lang="surface:email"]')).toHaveLength(1);
    const chart = root.querySelector('section[data-lang="surface:chart"]');
    expect(chart).not.toBeNull();
    expect([...(chart?.querySelectorAll('td, th') ?? [])].map((cell) => cell.textContent)).toEqual([
      'Month',
      'Requests',
      'Jan',
      '10',
      'Feb',
      '30',
    ]);
    expect(chart?.closest('pre')).toBeNull();

    for (const readable of ['title: Missing the address', 'A widget this client does not draw.']) {
      const node = [...root.querySelectorAll('p')].find((paragraph) =>
        paragraph.textContent?.includes(readable),
      );
      expect(node, readable).toBeTruthy();
      expect(node?.closest('pre')).toBeNull();
    }

    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(root.querySelector('[aria-label="Run"]')).toBeNull();
    expect(root.textContent).not.toContain('Send');
    expect(root.textContent).toContain('have not been executed');
    const tool = root.querySelector('section[data-lang="surface:tool"]');
    expect(tool?.textContent).toContain('Failed');
    expect(tool?.textContent).not.toContain('Completed');

    const prompt = root.querySelector('section[data-lang="surface:prompt"]');
    expect(prompt?.querySelector('.sp-code-block')).toBeNull();
    const promptCopy = [...(prompt?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Copy full prompt',
    );
    expect(promptCopy).toBeTruthy();
    promptCopy?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Inspect the application.');
    const copiedPrompt = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as string;
    expect(copiedPrompt).not.toContain('Copy full prompt');
    expect(copiedPrompt).not.toContain('Prompt');

    expect(root.querySelector('section[data-lang^="surface:"] .sp-code-block')).toBeNull();
    expect(root.querySelector('.sp-code-block')).not.toBeNull();
    const commands = root.querySelector('section[data-lang="surface:commands"]');
    [...(commands?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent === 'Copy commands')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('pnpm test');
    expect(
      String((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]),
    ).not.toContain('have not been executed');

    [...root.querySelectorAll('button')]
      .find((button) => button.textContent === 'Show the document')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFollowUp).toHaveBeenCalledWith('Show the document');

    const box = root.querySelector<HTMLInputElement>(
      'section[data-lang="surface:checklist"] input',
    );
    expect(box).not.toBeNull();
    if (!box) return;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(root.querySelector('[data-lang="surface:progress"]')?.textContent).toBe('2 of 2');
  });
});
