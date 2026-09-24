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

  it('leaves uncertain numeric markers unlinked without disabling explicit source links', () => {
    render(
      <MarkdownContent
        content={`Uncertain [1]. See [Framework pricing](${FRAME_WORK_URL}).`}
        citations={CITATIONS}
        linkifyNumericCitations={false}
      />,
    );

    expect(screen.getByText(/Uncertain \[1\]/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Source 1:/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Framework pricing' }).getAttribute('href')).toBe(
      FRAME_WORK_URL,
    );
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

describe('MarkdownContent table alignment', () => {
  it('preserves left, center, and right alignment on headers and cells', () => {
    const markdown = [
      '| Label | Status | Amount |',
      '| :--- | :---: | ---: |',
      '| Alpha | Ready | 1,234 |',
    ].join('\n');

    const { container } = render(<MarkdownContent content={markdown} />);

    const headers = Array.from(container.querySelectorAll('th'));
    const cells = Array.from(container.querySelectorAll('td'));
    expect(headers.map((header) => header.className)).toEqual([
      expect.stringContaining('text-left'),
      expect.stringContaining('text-center'),
      expect.stringContaining('text-right'),
    ]);
    expect(cells.map((cell) => cell.className)).toEqual([
      expect.stringContaining('text-left'),
      expect.stringContaining('text-center'),
      expect.stringContaining('text-right'),
    ]);
    expect(cells[2]?.textContent).toBe('1,234');
    const region = screen.getByRole('region', { name: 'Table' });
    expect(region.className).toContain('overflow-x-auto');
    expect(region.querySelector('table')).not.toBeNull();
  });
});

describe('MarkdownContent literal HTML', () => {
  it('keeps an angle-bracket placeholder visible as text', () => {
    const { container } = render(
      <MarkdownContent content={'**Result:** FINAL=<number>'} literalHtml />,
    );

    expect(container.textContent).toContain('Result: FINAL=<number>');
    expect(container.querySelector('number')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('Result:');
  });

  it('shows hostile markup literally without creating executable elements', () => {
    const hostile = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">';
    const { container } = render(<MarkdownContent content={hostile} literalHtml />);

    expect(container.textContent).toContain(hostile);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
    expect(container.innerHTML).toContain('&lt;img');
  });
});
