/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import '../webview/render';
import { bindAnswerSurfaces } from '../webview/render';
import {
  MIXED_ASSISTANT_REPLY,
  MIXED_REPLY_THROUGH_EMAIL,
} from '@agiworkforce/unified-chat/assistant-fence';

function parse(markdown: string): Document {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  return new DOMParser().parseFromString(html ?? '', 'text/html');
}

function assertOrder(text: string, parts: readonly string[]): void {
  let at = -1;
  for (const part of parts) {
    const next = text.indexOf(part, at + 1);
    expect(next, part).toBeGreaterThan(at);
    at = next;
  }
}

function chartCells(root: ParentNode): string[] {
  return [...root.querySelectorAll('td, th')].map((cell) => cell.textContent ?? '');
}

describe('vscode mixed assistant reply', () => {
  it('renders one mixed reply in order, with a chart table, fallbacks, copy, follow-up, and one email after growth', () => {
    const partial = parse(MIXED_REPLY_THROUGH_EMAIL);
    expect(partial.querySelectorAll('.answer-surface-email')).toHaveLength(1);

    const doc = parse(`${MIXED_ASSISTANT_REPLY}\n\nMore prose.`);
    assertOrder(doc.body.textContent ?? '', [
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

    expect(doc.querySelectorAll('.answer-surface-email')).toHaveLength(1);
    const chart = doc.querySelector('.answer-surface-chart');
    expect(chart).not.toBeNull();
    expect(chartCells(chart ?? doc.body)).toEqual(['Month', 'Requests', 'Jan', '10', 'Feb', '30']);
    expect(chart?.closest('pre, .code-block-wrapper')).toBeNull();

    for (const readable of ['title: Missing the address', 'A widget this client does not draw.']) {
      const node = [...doc.querySelectorAll('p')].find((paragraph) =>
        paragraph.textContent?.includes(readable),
      );
      expect(node, readable).toBeTruthy();
      expect(node?.closest('pre, .code-block-wrapper')).toBeNull();
    }

    expect(doc.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(doc.querySelector('button[aria-label="Run"]')).toBeNull();
    expect(doc.body.textContent).toContain('have not been executed');
    expect(doc.body.textContent).not.toContain('Send');
    const tool = doc.querySelector('.answer-surface-tool');
    expect(tool?.textContent).toContain('Failed');
    expect(tool?.textContent).not.toContain('Completed');

    const copy = vi.fn();
    const onFollowUp = vi.fn();
    bindAnswerSurfaces(doc, { copy, onFollowUp });
    doc.querySelector<HTMLButtonElement>('.answer-surface-prompt .surface-copy')?.click();
    expect(copy).toHaveBeenCalledWith('Inspect the application.');
    expect(copy.mock.calls.at(-1)?.[0]).not.toContain('Copy full prompt');
    doc.querySelector<HTMLButtonElement>('.answer-surface-commands .surface-copy')?.click();
    expect(copy).toHaveBeenCalledWith('pnpm test');
    expect(String(copy.mock.calls.at(-1)?.[0])).not.toContain('have not been executed');
    doc.querySelector<HTMLButtonElement>('.surface-followup')?.click();
    expect(onFollowUp).toHaveBeenCalledWith('Show the document');
    doc.querySelector<HTMLButtonElement>('.surface-check[aria-pressed="false"]')?.click();
    expect(doc.querySelector('.answer-progress')?.textContent).toBe('2 of 2');
  });
});
