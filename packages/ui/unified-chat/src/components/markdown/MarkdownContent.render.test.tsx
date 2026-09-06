import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./MermaidDiagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('./HighlightedCode', () => ({
  HighlightedCode: ({ code }: { code: string }) => <>{code}</>,
}));

const { MarkdownContent } = await import('./MarkdownContent');

const FRAME_WORK_URL = 'https://frame.work';
const PRICE_LABEL = '$1,999';

const CITATIONS = [{ url: FRAME_WORK_URL, title: 'Framework Laptop 13' }] as const;

beforeEach(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe('MarkdownContent citation links', () => {
  it('keeps a priced table cell readable when its href matches a cited domain', () => {
    const markdown = [
      '| Laptop | Price |',
      '| --- | --- |',
      `| Framework 13 | [**${PRICE_LABEL}**](${FRAME_WORK_URL}) |`,
    ].join('\n');

    render(<MarkdownContent content={markdown} citations={CITATIONS} />);

    const link = screen.getByRole('link', { name: PRICE_LABEL });
    expect(link.getAttribute('href')).toBe(FRAME_WORK_URL);
    expect(link.querySelector('strong')?.textContent).toBe(PRICE_LABEL);
  });

  it('collapses a link whose own text is only the cited bare domain', () => {
    render(
      <MarkdownContent
        content={`Buy it at [frame.work](${FRAME_WORK_URL}).`}
        citations={CITATIONS}
      />,
    );

    expect(screen.getByRole('link', { name: /^Source 1:/ }).getAttribute('href')).toBe(
      FRAME_WORK_URL,
    );
  });

  it('collapses a bracketed citation marker into a chip', () => {
    render(<MarkdownContent content="The price held [1]." citations={CITATIONS} />);

    expect(screen.getByRole('link', { name: /^Source 1:/ }).getAttribute('href')).toBe(
      FRAME_WORK_URL,
    );
    expect(screen.queryByText('[1]')).toBeNull();
  });

  it('keeps prose link text when the href is an exact cited url', () => {
    render(
      <MarkdownContent
        content={`See the [Framework pricing page](${FRAME_WORK_URL}) for details.`}
        citations={CITATIONS}
      />,
    );

    expect(screen.getByRole('link', { name: 'Framework pricing page' }).getAttribute('href')).toBe(
      FRAME_WORK_URL,
    );
  });
});

describe('MarkdownContent task lists', () => {
  const TASK_LIST = '- [x] Shipped\n- [ ] Pending';

  it('renders a completed item as a checked, disabled checkbox', () => {
    render(<MarkdownContent content={TASK_LIST} />);

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[0] as HTMLInputElement).disabled).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('drops the bullet marker from a task list and its items', () => {
    const { container } = render(<MarkdownContent content={TASK_LIST} />);

    const list = container.querySelector('ul');
    expect(list?.className).toContain('list-none');
    expect(list?.className).not.toContain('list-disc');
    for (const item of Array.from(container.querySelectorAll('li'))) {
      expect(item.className).toContain('list-none');
    }
  });

  it('keeps the bullet marker on a plain list', () => {
    const { container } = render(<MarkdownContent content={'- One\n- Two'} />);

    const list = container.querySelector('ul');
    expect(list?.className).toContain('list-disc');
    expect(list?.className).not.toContain('list-none');
  });

  it('paints the checked box with the accent fill and the on-fill token declared for it', () => {
    const { container } = render(<MarkdownContent content={TASK_LIST} />);

    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    const checkedBox = boxes[0]?.parentElement;
    const openBox = boxes[1]?.parentElement;
    expect(checkedBox?.className).toContain('bg-[var(--chat-accent-primary)]');
    expect(checkedBox?.className).toContain('text-[var(--chat-accent-on-primary)]');
    expect(checkedBox?.querySelector('svg')).not.toBeNull();
    expect(openBox?.className).toContain('border-[var(--chat-text-muted)]');
    expect(checkedBox?.className).toContain('border-[var(--chat-text-muted)]');
    expect(openBox?.querySelector('svg')).toBeNull();
  });
});
