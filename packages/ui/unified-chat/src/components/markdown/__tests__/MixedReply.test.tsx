import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIXED_ASSISTANT_REPLY, MIXED_REPLY_THROUGH_EMAIL } from '../assistantFence';

type MermaidDiagramModule = typeof import('../MermaidDiagram');
type HighlightedCodeModule = typeof import('../HighlightedCode');

vi.mock('../MermaidDiagram', async (importOriginal) => ({
  ...(await importOriginal<MermaidDiagramModule>()),
  MermaidDiagram: () => null,
}));

vi.mock('../HighlightedCode', async (importOriginal) => ({
  ...(await importOriginal<HighlightedCodeModule>()),
  HighlightedCode: ({ code, language }: { code: string; language: string }) => (
    <code data-testid="highlighted" data-language={language}>
      {code}
    </code>
  ),
}));

const { MarkdownContent } = await import('../MarkdownContent');
const { StreamingMarkdownContent } = await import('../StreamingMarkdownContent');

function appearance(container: HTMLElement): string {
  return container.textContent ?? '';
}

function assertOrder(text: string): void {
  let at = -1;
  for (const part of [
    'Here is the plan in ordinary prose.',
    'Subject',
    'const ready = true;',
    'Inspect the application.',
    'pnpm test',
    'Authentication',
    'Passed',
    'Basic',
    'Jan',
    '10',
    'QA Checklist',
    '1 of 2',
    'Writing blocks',
    '2 assertions failed',
    'Show the document',
    'Missing the address',
    'A widget this client does not draw.',
    'Open the application.',
  ]) {
    const next = text.indexOf(part, at + 1);
    expect(next, part).toBeGreaterThan(at);
    at = next;
  }
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe('mixed assistant reply', () => {
  it('keeps each block in order and leaves prose, invalid, and unknown text readable', () => {
    const onFollowUp = vi.fn();
    const { container } = render(
      <MarkdownContent content={MIXED_ASSISTANT_REPLY} onFollowUp={onFollowUp} />,
    );
    const text = appearance(container);
    assertOrder(text);
    const prose = screen.getByText('Here is the plan in ordinary prose.');
    expect(prose.closest('[data-answer-surface], [data-rich-block]')).toBeNull();
    expect(screen.getByDisplayValue('ada@example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('Please review the build.')).toBeTruthy();
    expect(container.querySelectorAll('[data-rich-block="email"]')).toHaveLength(1);
    expect(container.querySelector('[data-answer-fallback="invalid"]')?.textContent).toContain(
      'Missing the address',
    );
    expect(container.querySelector('[data-answer-fallback="unknown"]')?.textContent).toContain(
      'A widget this client does not draw.',
    );
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    expect(screen.getByText(/have not been executed/)).toBeTruthy();
    const tool = container.querySelector('[data-answer-surface="tool"]');
    expect(tool?.textContent).toContain('Failed');
    expect(tool?.textContent).not.toContain('Completed');
    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy full prompt' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Inspect the application.');
    fireEvent.click(screen.getByRole('button', { name: 'Copy commands' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('pnpm test');
    fireEvent.click(screen.getByRole('button', { name: 'Show the document' }));
    expect(onFollowUp).toHaveBeenCalledWith('Show the document');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Verify chat rendering' }));
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('does not duplicate a finished email when a later chunk arrives', () => {
    const { container, rerender } = render(
      <StreamingMarkdownContent content={MIXED_REPLY_THROUGH_EMAIL} isStreaming />,
    );
    expect(container.querySelectorAll('[data-rich-block="email"]')).toHaveLength(1);
    rerender(<StreamingMarkdownContent content={MIXED_ASSISTANT_REPLY} isStreaming />);
    expect(container.querySelectorAll('[data-rich-block="email"]')).toHaveLength(1);
    expect(appearance(container)).toContain('Jan');
    expect(appearance(container)).toContain('Missing the address');
  });
});
